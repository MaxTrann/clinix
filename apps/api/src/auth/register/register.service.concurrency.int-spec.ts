import type { DataSource, QueryRunner } from 'typeorm';
import { vi } from 'vitest';
import {
  isDeadlockError,
  isDuplicateKeyError,
} from '../../database/mysql-errors.js';
import { resetTables } from '../../database/testing/test-database.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import {
  insertMaXacThuc,
  insertPhienDangNhap,
  insertTaiKhoan,
} from '../entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { at } from '../testing/otp-int-helpers.js';
import {
  allAccounts,
  allOtpRows,
  appExceptionOf,
  createRegisterFixture,
  registerBody,
  type RegisterFixture,
} from '../testing/register-int-helpers.js';

// Task A5 — chạy đua trên MySQL 8.4 THẬT. Hai nhóm:
//  (1) "hành vi MySQL 8.4 thật mà thiết kế dựa vào" (RG-S1, S2, S4, S5): giữ lại các kịch bản thăm dò đã dùng để chọn thuật toán
//      "chèn trước, lỗi trùng thì ROLLBACK rồi khoá lại" thay vì "khoá theo email trước" — trên chính bảng tai_khoan, không dựa trí nhớ;
//  (2) DK-27 và các biến thể ở tầng dịch vụ (RC-nn). Mã RG-nn / RC-nn là [đề xuất]. Đồng hồ giả chỉ giả Date.
const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;
const EMAIL = 'dua.nhau@example.com';

let db: DataSource;
let fx: RegisterFixture<FakeMailService>;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = createRegisterFixture(testDb);
});

// ------------------------------------------------------------------------------------------------ hạ tầng cho nhóm (1)
const INSERT_SQL =
  'INSERT INTO tai_khoan (ho_ten, so_dien_thoai, email, mat_khau_bam, loai_tai_khoan, thoi_diem_tao) VALUES (?, ?, ?, ?, ?, ?)';
const insertParams = (email: string) => [
  'Thử Khoá',
  '0901234567',
  email,
  '$argon2id$gia',
  'BenhNhan',
  at(0),
];
const SELECT_LOCK_SQL =
  'SELECT tai_khoan_id FROM tai_khoan WHERE email = ? FOR UPDATE';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function barrier(parties: number): () => Promise<void> {
  let arrived = 0;
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return () => {
    arrived += 1;
    if (arrived >= parties) open();
    return gate;
  };
}

async function withRunners<T>(
  count: number,
  work: (runners: QueryRunner[]) => Promise<T>,
): Promise<T> {
  const runners: QueryRunner[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const runner = db.createQueryRunner();
      await runner.connect();
      runners.push(runner);
    }
    return await work(runners);
  } finally {
    for (const runner of runners) await runner.release();
  }
}

const errnoOf = (error: unknown): number | undefined =>
  (error as { driverError?: { errno?: number } }).driverError?.errno;
const rollbackQuietly = (runner: QueryRunner) =>
  runner.rollbackTransaction().catch(() => undefined);

// Đo lại ở CẢ HAI mức cô lập: giao dịch của A5 chạy READ COMMITTED (OtpService.transaction) nhưng các kịch bản này là căn cứ chọn thuật toán nên giữ
// cả kết quả REPEATABLE READ (mức mặc định của MySQL) để thấy vì sao "chọn-trước" bị loại và "chèn-trước" đúng ở mọi mức.
describe('hành vi MySQL 8.4 thật mà thiết kế dựa vào (không dựa trí nhớ), ở cả hai mức cô lập', () => {
  it.each([
    ['REPEATABLE READ', ['DEADLOCK', 'TAO_MOI']],
    ['READ COMMITTED', ['TAO_MOI', 'TRUNG_KHOA']],
  ] as const)(
    'RG-S1 [%s] "chọn-trước": hai giao dịch cùng SELECT … FOR UPDATE trên email CHƯA có rồi cùng INSERT → %j (REPEATABLE READ: một bên bị DEADLOCK; READ COMMITTED: không còn khoá khoảng, bên kia nhận lỗi trùng khoá)',
    async (level, expected) => {
      for (let round = 0; round < 4; round++) {
        await db.query('DELETE FROM tai_khoan');
        const results = await withRunners(2, async (runners) => {
          const wait = barrier(2);
          return Promise.all(
            runners.map(async (runner) => {
              await runner.startTransaction(level);
              try {
                const rows: unknown[] = await runner.query(SELECT_LOCK_SQL, [
                  EMAIL,
                ]);
                expect(rows).toHaveLength(0);
                await wait(); // cả hai cùng đã "thấy chưa có" rồi mới cùng chèn
                await runner.query(INSERT_SQL, insertParams(EMAIL));
                await runner.commitTransaction();
                return 'TAO_MOI';
              } catch (error) {
                await rollbackQuietly(runner);
                if (isDeadlockError(error)) return 'DEADLOCK';
                if (isDuplicateKeyError(error)) return 'TRUNG_KHOA';
                return `LOI_KHAC ${String(errnoOf(error))}`;
              }
            }),
          );
        });
        expect(results.slice().sort(), `vòng ${String(round)}`).toEqual(
          expected,
        );
        expect(await allAccounts(db)).toHaveLength(1);
      }
    },
  );

  it.each(['REPEATABLE READ', 'READ COMMITTED'] as const)(
    'RG-S2 [%s] "chèn-trước": B chèn trùng khi A chưa commit thì B BỊ CHẶN cho tới khi A commit, rồi nhận lỗi trùng khoá (1062), không phải 500 lạ',
    async (level) => {
      await withRunners(2, async ([a, b]) => {
        if (!a || !b) throw new Error('thiếu kết nối');
        await a.startTransaction(level);
        await a.query(INSERT_SQL, insertParams(EMAIL));
        await b.startTransaction(level);
        let settled = false;
        const bOutcome = b
          .query(INSERT_SQL, insertParams(EMAIL))
          .then(() => 'CHEN_DUOC')
          .catch((error: unknown) =>
            isDuplicateKeyError(error) ? 'TRUNG_KHOA' : 'LOI_KHAC',
          )
          .finally(() => {
            settled = true;
          });

        await sleep(600);
        expect(settled, 'B phải đang chờ khi A chưa commit').toBe(false);
        await a.commitTransaction();
        expect(await bOutcome).toBe('TRUNG_KHOA');
        await rollbackQuietly(b);
      });
      expect(await allAccounts(db)).toHaveLength(1);
    },
  );

  it.each(['REPEATABLE READ', 'READ COMMITTED'] as const)(
    'RG-S4 [%s] "chèn-trước, lỗi trùng thì ROLLBACK rồi giao dịch MỚI mới khoá hàng": 4 bên đồng thời, nhiều vòng → luôn đúng 1 bên tạo + 3 bên thấy hàng, không deadlock',
    async (level) => {
      for (let round = 0; round < 10; round++) {
        await db.query('DELETE FROM tai_khoan');
        const results = await withRunners(4, async (runners) => {
          const wait = barrier(runners.length);
          return Promise.all(
            runners.map(async (runner): Promise<string> => {
              await wait();
              for (let attempt = 0; attempt < 3; attempt++) {
                await runner.startTransaction(level);
                try {
                  await runner.query(INSERT_SQL, insertParams(EMAIL));
                  await runner.commitTransaction();
                  return 'TAO_MOI';
                } catch (error) {
                  await rollbackQuietly(runner);
                  if (!isDuplicateKeyError(error))
                    return `LOI ${String(errnoOf(error))}`;
                }
                await runner.startTransaction(level);
                try {
                  const rows: unknown[] = await runner.query(SELECT_LOCK_SQL, [
                    EMAIL,
                  ]);
                  await runner.commitTransaction();
                  if (rows.length > 0) return 'THAY_HANG';
                } catch (error) {
                  await rollbackQuietly(runner);
                  return `LOI_KHOA ${String(errnoOf(error))}`;
                }
              }
              return 'HET_LAN_THU';
            }),
          );
        });
        expect(results.slice().sort(), `vòng ${String(round)}`).toEqual([
          'TAO_MOI',
          'THAY_HANG',
          'THAY_HANG',
          'THAY_HANG',
        ]);
        expect(await allAccounts(db)).toHaveLength(1);
      }
    },
  );

  it.each([
    ['REPEATABLE READ', 'LOI 1205'],
    ['READ COMMITTED', 'CHEN_DUOC'],
  ] as const)(
    'RG-S5 [%s] khoá khoảng: "chọn-trước" trên email chưa có → chèn email KHÁC nằm cùng khoảng chỉ mục cho kết quả %s (REPEATABLE READ: bị chặn tới hết thời gian chờ 1205; READ COMMITTED: không có khoá khoảng); email ngoài khoảng luôn qua',
    async (level, inGapExpected) => {
      await db.query(INSERT_SQL, insertParams('a@example.com'));
      await db.query(INSERT_SQL, insertParams('z@example.com'));
      await withRunners(2, async ([a, b]) => {
        if (!a || !b) throw new Error('thiếu kết nối');
        await a.query('SET SESSION innodb_lock_wait_timeout = 2');
        await b.query('SET SESSION innodb_lock_wait_timeout = 2');
        await a.startTransaction(level);
        expect(await a.query(SELECT_LOCK_SQL, ['m@example.com'])).toHaveLength(
          0,
        );

        await b.startTransaction(level);
        const inGap = await b
          .query(INSERT_SQL, insertParams('n@example.com'))
          .then(() => 'CHEN_DUOC')
          .catch((error: unknown) => `LOI ${String(errnoOf(error))}`);
        expect(inGap).toBe(inGapExpected);
        await rollbackQuietly(b);

        await b.startTransaction(level);
        await b.query(INSERT_SQL, insertParams('zzz@example.com')); // ngoài khoảng: qua ngay
        await b.commitTransaction();
        await rollbackQuietly(a);
      });
    },
  );
  it('RG-S6 email khác hoa/thường vẫn là cùng khoá duy nhất (utf8mb4_unicode_ci): căn cứ của DK-17', async () => {
    await db.query(INSERT_SQL, insertParams('nguyen.van@example.com'));
    const code = await db
      .query(INSERT_SQL, insertParams('NGUYEN.VAN@EXAMPLE.COM'))
      .then(() => null)
      .catch((error: unknown) =>
        isDuplicateKeyError(error) ? 'TRUNG_KHOA' : 'LOI_KHAC',
      );
    expect(code).toBe('TRUNG_KHOA');
  });
});

describe('đăng ký đồng thời ở tầng dịch vụ (DK-27)', () => {
  async function settle(count: number, body = registerBody()) {
    return Promise.allSettled(
      Array.from({ length: count }, () => fx.service.register(body)),
    );
  }

  it('RC-01 nhiều yêu cầu cùng email mới: đúng 1 tài khoản, đúng 1 thành công, các yêu cầu còn lại đi theo nhánh "chưa xác minh còn hạn" nên bị GUI_LAI_QUA_SOM; không 500, không thư thừa', async () => {
    for (let round = 0; round < 6; round++) {
      await resetTables(db);
      fx.mail.reset();
      const results = await settle(
        5,
        registerBody({ email: `vong.${String(round)}@example.com` }),
      );

      const ok = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(ok, `vòng ${String(round)}`).toHaveLength(1);
      for (const r of rejected) {
        const error = r.reason as { maLoi?: string; message?: string };
        expect(error.maLoi, error.message).toBe('GUI_LAI_QUA_SOM'); // lỗi nào khác (kể cả 500) đều làm test đỏ
      }
      expect(await allAccounts(db)).toHaveLength(1);
      expect(await allOtpRows(db)).toHaveLength(1);
      expect(fx.mail.attempts).toHaveLength(1);
    }
  });

  it('RC-02 nhiều yêu cầu cùng lúc trên tài khoản đã QUÁ 24 GIỜ: đúng 1 yêu cầu xoá lười rồi tạo mới, các yêu cầu khác thấy tài khoản MỚI và bị GUI_LAI_QUA_SOM; tài khoản cũ và hàng con biến mất đúng một lần', async () => {
    for (let round = 0; round < 4; round++) {
      await resetTables(db);
      fx.mail.reset();
      const old = await insertTaiKhoan(db, {
        email: EMAIL,
        daXacMinhEmail: false,
        thoiDiemTao: at(-DAY - 100),
      });
      await insertMaXacThuc(db, old.taiKhoanId, { taoLuc: at(-DAY - 100) });
      await insertPhienDangNhap(db, old.taiKhoanId);

      const results = await settle(4, registerBody({ email: EMAIL }));

      expect(
        results.filter((r) => r.status === 'fulfilled'),
        `vòng ${String(round)}`,
      ).toHaveLength(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect((r.reason as { maLoi?: string }).maLoi).toBe(
            'GUI_LAI_QUA_SOM',
          );
        }
      }
      const accounts = await allAccounts(db);
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.taiKhoanId).not.toBe(old.taiKhoanId);
      expect(accounts[0]?.thoiDiemTao).toEqual(at(0));
      expect(
        await db
          .getRepository(MaXacThuc)
          .countBy({ taiKhoanId: old.taiKhoanId }),
      ).toBe(0);
      expect(
        await db
          .getRepository(PhienDangNhap)
          .countBy({ taiKhoanId: old.taiKhoanId }),
      ).toBe(0);
      expect(await allOtpRows(db)).toHaveLength(1);
    }
  });

  it('RC-03 nhiều email KHÁC NHAU nằm cùng khoảng chỉ mục đăng ký cùng lúc: tất cả thành công, không chặn nhau, không deadlock (khác cách "chọn-trước", RG-S5)', async () => {
    await insertTaiKhoan(db, { email: 'a@example.com', daXacMinhEmail: true });
    await insertTaiKhoan(db, { email: 'z@example.com', daXacMinhEmail: true });
    const emails = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map(
      (n) => `${n}@example.com`,
    );

    const results = await Promise.allSettled(
      emails.map((email) => fx.service.register(registerBody({ email }))),
    );

    // In lý do từ chối (mã MySQL nếu có) để khi đỏ biết ngay đó là gì
    const reasons = results.map((r) =>
      r.status === 'fulfilled'
        ? 'ok'
        : `${(r.reason as Error).name}: errno=${String((r.reason as { driverError?: { errno?: number } }).driverError?.errno)} ${(r.reason as { maLoi?: string }).maLoi ?? ''}`,
    );
    expect(reasons).toEqual(emails.map(() => 'ok'));
    expect(await allAccounts(db)).toHaveLength(8);
    expect(fx.mail.sent).toHaveLength(6);
  });

  it('RC-04 yêu cầu đến khi tài khoản vừa được ĐÃ XÁC MINH bởi bên khác: EMAIL_DA_DUNG, không tạo thêm', async () => {
    await fx.service.register(registerBody());
    await db.query(
      'UPDATE tai_khoan SET da_xac_minh_email = 1 WHERE email = ?',
      [registerBody().email],
    );
    vi.setSystemTime(at(61));
    const error = await appExceptionOf(fx.service.register(registerBody()));
    expect(error.maLoi).toBe('EMAIL_DA_DUNG');
    expect(await allAccounts(db)).toHaveLength(1);
  });
});
