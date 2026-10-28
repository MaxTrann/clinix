import type { DataSource, EntityManager } from 'typeorm';
import { resetTables } from '../../database/testing/test-database.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import {
  insertMaXacThuc,
  insertPhienDangNhap,
  insertTaiKhoan,
} from '../entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { at } from '../testing/otp-int-helpers.js';
import {
  barrier,
  classify,
  describeTally,
  type Tally,
} from '../testing/otp-multi-account.js';
import {
  allAccounts,
  allOtpRows,
  createRegisterFixture,
  registerBody,
  type RegisterFixture,
} from '../testing/register-int-helpers.js';

// Task A5 (bổ sung theo yêu cầu của người dùng, cùng loại lỗi với A5-C) — `UnverifiedPatientCleaner.purgeIfExpired` với NHIỀU tài khoản khác nhau
// chạy đồng thời, mỗi tài khoản một giao dịch riêng, ở CẢ HAI mức cô lập, trên MySQL 8.4 thật. Test cũ (RC-02 của register.service.concurrency)
// chỉ thử cùng MỘT tài khoản nên không thấy deadlock chéo tài khoản. Admin B15 sẽ gọi hàm này trong giao dịch của admin (mặc định REPEATABLE READ),
// job A7 gọi hàng loạt. Đo bằng số lỗi MySQL THẬT: lỗi trả ra (1213, 1205) VÀ bộ đếm `lock_deadlocks` của máy chủ (bắt cả deadlock mà
// RegisterService âm thầm thử lại nên không thành lỗi ở phía gọi). Mã CL-Mnn là [đề xuất].
//  - READ COMMITTED (cách dùng chuẩn, `OtpService.transaction`): khẳng định 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ, mọi việc thành công.
//  - REPEATABLE READ (giao dịch mặc định của DataSource): CHỈ khẳng định kết quả nhất quán (xoá đúng một lần cùng hàng con, việc lỗi thì
//    hoàn tác trọn, không xoá nhầm) và IN số đo; không khẳng định "0 deadlock" vì 0 trong N vòng chưa phải bằng chứng về cơ chế.
// Số vòng chỉnh bằng biến môi trường CLEANER_MULTI_ROUNDS: mặc định 8 vòng (khoảng 25 giây, mỗi vòng dựng lại DB tốn chừng 0,8 giây ở mỗi kịch bản);
// khi đo kỹ dùng 50 (khoảng 160 giây) và chạy với `--reporter=verbose` để thấy dòng số đo "[CL-M]".
const ROUNDS = Number(process.env['CLEANER_MULTI_ROUNDS'] ?? 8);
const PARTIES = 6;
const NEW_EMAILS = 3;
const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;

type Level = 'READ COMMITTED' | 'REPEATABLE READ';
const LEVELS: readonly Level[] = ['READ COMMITTED', 'REPEATABLE READ'];
type Scenario = 'purge' | 'purge-while-register';

let db: DataSource;
let fx: RegisterFixture<FakeMailService>;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = createRegisterFixture(testDb);
});

// RC: cách dùng chuẩn (`OtpService.transaction`); RR: giao dịch mặc định của DataSource, như admin B15 sẽ mở
const openTx =
  (level: Level) =>
  <T>(work: (em: EntityManager) => Promise<T>): Promise<T> =>
    level === 'READ COMMITTED'
      ? fx.otp.transaction(work)
      : db.transaction(level, work);

// Bộ đếm `lock_deadlocks` của InnoDB toàn máy chủ (bắt cả deadlock mà RegisterService bắt rồi thử lại nên không thành lỗi ở phía gọi).
// Bật nếu máy chủ đang tắt: chỉ là bộ đếm, không đổi hành vi khoá.
async function serverDeadlocks(): Promise<number> {
  await db.query("SET GLOBAL innodb_monitor_enable = 'lock_deadlocks'");
  const rows: { COUNT: string }[] = await db.query(
    "SELECT `COUNT` FROM information_schema.INNODB_METRICS WHERE NAME = 'lock_deadlocks'",
  );
  return Number(rows[0]?.COUNT);
}

/** Bệnh nhân chưa xác minh đã quá 24 giờ 1 phút, kèm hai mã OTP và một phiên (đủ ba bảng hàng con mà hàm phải xoá theo thứ tự). */
async function seedExpired(email: string): Promise<string> {
  const born = at(-(DAY + 60));
  const { taiKhoanId } = await insertTaiKhoan(db, {
    daXacMinhEmail: false,
    thoiDiemTao: born,
    email,
  });
  await insertMaXacThuc(db, taiKhoanId, { taoLuc: born });
  await insertMaXacThuc(db, taiKhoanId, {
    loai: 'QuenMatKhau',
    hoTenDangKy: null,
    soDienThoaiDangKy: null,
    matKhauBamDangKy: null,
    taoLuc: at(-(DAY + 55)),
  });
  await insertPhienDangNhap(db, taiKhoanId);
  return taiKhoanId;
}

interface Measured {
  tally: Tally;
  serverDeadlocks: number;
  purged: number; // số lần purgeIfExpired trả true
  rejected: number; // số việc bị lỗi (1213 / 1205 / khác) và đã hoàn tác
  inconsistent: string[]; // vi phạm tính nhất quán (khác với lỗi: lỗi mà hoàn tác trọn vẫn nhất quán)
}

/**
 * `rounds` vòng; mỗi vòng dựng lại DB rồi chạy các việc của `scenario` ĐỒNG THỜI (cùng qua một rào chắn):
 *  - 'purge': 6 Bệnh nhân chưa xác minh quá hạn, mỗi người một giao dịch gọi purgeIfExpired (như job A7 hay nhiều admin cùng lúc);
 *  - 'purge-while-register': 1 tài khoản quá hạn bị xoá trong lúc 3 email KHÁC (chưa có) đăng ký mới qua RegisterService.
 * Nhất quán: việc thành công ⇒ kết quả đủ (tài khoản cùng hàng con đã biến mất / tài khoản mới có đủ hàng OTP); việc lỗi ⇒ hoàn tác trọn
 * (tài khoản còn nguyên 2 hàng OTP + 1 phiên / email mới không có tài khoản); không tài khoản nào khác bị xoá.
 */
async function measure(scenario: Scenario, level: Level): Promise<Measured> {
  const tx = openTx(level);
  const tally: Tally = {
    requests: 0,
    ok: 0,
    deadlock1213: 0,
    lockTimeout1205: 0,
    other: {},
  };
  const measured: Measured = {
    tally,
    serverDeadlocks: 0,
    purged: 0,
    rejected: 0,
    inconsistent: [],
  };
  const before = await serverDeadlocks();

  for (let round = 0; round < ROUNDS; round++) {
    await resetTables(db);
    const where = `vòng ${String(round)}`;
    const expired: { id: string; purged: boolean | 'rejected' }[] = [];
    const actions: (() => Promise<unknown>)[] = [];
    for (let i = 0; i < (scenario === 'purge' ? PARTIES : 1); i++) {
      const email = `het.han.${String(i)}@example.com`;
      const entry: (typeof expired)[number] = {
        id: await seedExpired(email),
        purged: 'rejected',
      };
      expired.push(entry);
      // Như admin B15: đọc thường tìm tài khoản đang giữ email (lập ảnh chụp dưới REPEATABLE READ) rồi mới xoá
      actions.push(async () => {
        entry.purged = await tx(async (em) => {
          await em.query('SELECT tai_khoan_id FROM tai_khoan WHERE email = ?', [
            email,
          ]);
          return fx.cleaner.purgeIfExpired(em, entry.id);
        });
      });
    }
    const registered: { email: string; done: boolean }[] = [];
    if (scenario === 'purge-while-register') {
      for (let i = 0; i < NEW_EMAILS; i++) {
        const entry = {
          email: `dang.ky.moi.${String(i)}@example.com`,
          done: false,
        };
        registered.push(entry);
        actions.push(async () => {
          await fx.service.register(registerBody({ email: entry.email }));
          entry.done = true;
        });
      }
    }

    const wait = barrier(actions.length);
    const results = await Promise.allSettled(
      actions.map(async (action) => {
        await wait();
        return action();
      }),
    );
    for (const result of results) classify(tally, result);
    measured.rejected += results.filter((r) => r.status === 'rejected').length;

    const accounts = await allAccounts(db);
    const otpRows = await allOtpRows(db);
    for (const { id, purged } of expired) {
      const account = accounts.filter((a) => a.taiKhoanId === id).length;
      const otps = otpRows.filter((o) => o.taiKhoanId === id).length;
      const sessions = await db
        .getRepository(PhienDangNhap)
        .countBy({ taiKhoanId: id });
      const state = `${String(account)} tài khoản, ${String(otps)} OTP, ${String(sessions)} phiên`;
      if (purged === true) {
        measured.purged += 1;
        if (state !== '0 tài khoản, 0 OTP, 0 phiên') {
          measured.inconsistent.push(`${where}: đã xoá nhưng còn ${state}`);
        }
      } else if (purged === false) {
        measured.inconsistent.push(`${where}: purgeIfExpired trả false`);
      } else if (state !== '1 tài khoản, 2 OTP, 1 phiên') {
        measured.inconsistent.push(
          `${where}: việc lỗi nhưng không hoàn tác trọn (${state})`,
        );
      }
    }
    for (const { email, done } of registered) {
      const account = accounts.find((a) => a.email === email);
      if (done !== (account !== undefined)) {
        measured.inconsistent.push(
          `${where}: đăng ký ${email} ${done ? 'thành công' : 'lỗi'} nhưng ${account ? 'có' : 'không có'} tài khoản`,
        );
      } else if (
        account &&
        !otpRows.some((o) => o.taiKhoanId === account.taiKhoanId)
      ) {
        measured.inconsistent.push(
          `${where}: tài khoản mới ${email} không có hàng OTP`,
        );
      }
    }
    const expectedAccounts =
      registered.filter((r) => r.done).length +
      expired.filter((e) => e.purged !== true).length;
    if (accounts.length !== expectedAccounts) {
      measured.inconsistent.push(
        `${where}: còn ${String(accounts.length)} tài khoản, mong đợi ${String(expectedAccounts)} (xoá nhầm hoặc sót)`,
      );
    }
  }
  measured.serverDeadlocks = (await serverDeadlocks()) - before;
  return measured;
}

describe.each(LEVELS)(
  'purgeIfExpired — nhiều tài khoản khác nhau chạy đồng thời ở mức %s',
  (level) => {
    it.each<Scenario>(['purge', 'purge-while-register'])(
      `CL-M %s: ${String(ROUNDS)} vòng, kết quả nhất quán (READ COMMITTED: còn khẳng định 0 lỗi 1213 và 1205)`,
      async (scenario) => {
        const result = await measure(scenario, level);
        const summary = `${level} / ${describeTally(scenario, result.tally)}; xoá được ${String(result.purged)}, việc lỗi ${String(result.rejected)}, deadlock phía máy chủ = ${String(result.serverDeadlocks)}`;
        console.info(`[CL-M] ${summary}`); // số đo cho báo cáo (cả hai mức)

        expect(result.inconsistent, summary).toEqual([]);
        if (level === 'READ COMMITTED') {
          expect(result.tally, summary).toMatchObject({
            deadlock1213: 0,
            lockTimeout1205: 0,
            other: {},
          });
          expect(result.tally.ok, summary).toBe(result.tally.requests);
          expect(result.serverDeadlocks, summary).toBe(0);
        }
      },
      600_000,
    );
  },
);
