import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { BenhNhan } from '../entities/benh-nhan.entity.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import {
  T0,
  at,
  captureNestLogger,
  createOtpFixture,
  forgotInput,
  issueDeliverRead,
  issueOk,
  newUnverifiedAccount,
  recipientOf,
  registerInput,
  rowOf,
  rowsOf,
  wrongCodeFor,
  type OtpFixture,
} from '../testing/otp-int-helpers.js';
import { OTP_MAX_WRONG_ATTEMPTS } from '../auth.constants.js';

// Task A2 — chạy đua trên MySQL 8.4 THẬT (khoá hàng, đếm nguyên tử, thứ tự khoá) và các hành vi MySQL mà thiết kế dựa vào.
// Mã test case: DK-28 (hai "Gửi lại mã" đồng thời), DK-29 (xác minh cùng OTP hai lần đồng thời), H8; QM-21 (mức consume được kiểm ở int-spec chính).
// Mã nội bộ OTP-Gnn / OTP-Mnn là [đề xuất]. Chạy lặp nhiều vòng vì lỗi đua chỉ lộ ra một phần số lần.
const ROUNDS = 15;

let db: DataSource;
let fx: OtpFixture<FakeMailService>;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
});

beforeEach(async () => {
  await resetTables(db);
  vi.useFakeTimers({ toFake: ['Date'] }); // chỉ giả Date; bộ hẹn giờ thật vẫn chạy nên kết nối MySQL không bị ảnh hưởng
  vi.setSystemTime(T0);
  captureNestLogger();
  fx = createOtpFixture(db);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db?.destroy();
});

// Rào chắn: mọi bên tới đủ rồi mới cùng đi tiếp (để các giao dịch thật sự chồng lên nhau)
function barrier(parties: number): { wait: () => Promise<void> } {
  let arrived = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    wait: () => {
      arrived += 1;
      if (arrived >= parties) release();
      return gate;
    },
  };
}

describe('hai yêu cầu cấp mã cùng lúc (DK-28, H8)', () => {
  it(`OTP-G01 hai "Gửi lại mã" đồng thời: chỉ MỘT mã được cấp trong 60 giây, dù chạy ${String(ROUNDS)} vòng`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newUnverifiedAccount(db);
      const results = await Promise.all([
        fx.otp.issue(registerInput(account.taiKhoanId)),
        fx.otp.issue(registerInput(account.taiKhoanId)),
      ]);
      expect(
        results.filter((r) => r.ok),
        `vòng ${String(round)}`,
      ).toHaveLength(1);
      const refused = results.find((r) => !r.ok);
      expect(refused).toMatchObject({
        ok: false,
        failure: { code: 'GUI_LAI_QUA_SOM', reason: 'TOO_SOON' },
      });
      expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(1);
    }
  });

  it('OTP-G02 giao dịch của người gọi đã đọc trước (ảnh chụp cũ) rồi mới cấp mã: đếm giới hạn vẫn thấy hàng vừa commit của bên kia nhờ đọc KHOÁ', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newUnverifiedAccount(db);
      const gate = barrier(2);
      const run = () =>
        db.transaction(async (em) => {
          // đọc thường: tạo ảnh chụp của giao dịch TRƯỚC khi tranh khoá
          await em.query(
            'SELECT COUNT(*) AS n FROM ma_xac_thuc WHERE tai_khoan_id = ?',
            [account.taiKhoanId],
          );
          await gate.wait();
          return fx.otp.issue(registerInput(account.taiKhoanId), {
            manager: em,
          });
        });
      const results = await Promise.all([run(), run()]);
      expect(
        results.filter((r) => r.ok),
        `vòng ${String(round)}`,
      ).toHaveLength(1);
      expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(1);
    }
  });

  it('OTP-G03 năm yêu cầu cấp mã cùng lúc cho tài khoản đã có 4 mã trong giờ: tối đa 1 yêu cầu vượt qua (cả hai giới hạn)', async () => {
    const account = await newUnverifiedAccount(db);
    for (const seconds of [0, 61, 122, 183]) {
      vi.setSystemTime(at(seconds));
      await issueOk(fx.otp, registerInput(account.taiKhoanId));
    }
    vi.setSystemTime(at(300));
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        fx.otp.issue(registerInput(account.taiKhoanId)),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(5);
  });
});

// A6 và A12 gọi consume/reissue bên trong giao dịch của họ, nơi có thể đã có một lần đọc thường trước đó (ảnh chụp REPEATABLE READ).
// Hàng OTP phải được đọc KHOÁ (FOR UPDATE) để thấy thay đổi bên khác vừa commit; đọc thường sẽ dùng nhầm dữ liệu cũ.
describe('consume và reissue trong giao dịch của người gọi đã có ảnh chụp cũ (A6, A12; N6, H8)', () => {
  it.each([
    ['thu_hoi_luc', 'REVOKED'],
    ['da_dung_luc', 'USED'],
  ] as const)(
    'OTP-G08 consume: bên khác vừa đặt %s sau lần đọc của người gọi: trả %s bằng kết quả, không ném, không dùng nhầm',
    async (column, reason) => {
      const account = await newUnverifiedAccount(db);
      const { id } = await issueDeliverRead(fx, account, 'QuenMatKhau');
      const result = await db.transaction(async (em) => {
        // đọc thường: tạo ảnh chụp của giao dịch người gọi TRƯỚC khi bên khác commit
        await em.query(
          'SELECT COUNT(*) AS n FROM ma_xac_thuc WHERE tai_khoan_id = ?',
          [account.taiKhoanId],
        );
        await db.query(
          `UPDATE ma_xac_thuc SET ${column} = ? WHERE ma_xac_thuc_id = ?`,
          [at(5), id],
        );
        return fx.otp.consume(
          {
            maXacThucId: id,
            taiKhoanId: account.taiKhoanId,
            loai: 'QuenMatKhau',
          },
          { manager: em },
        );
      });
      expect(result).toEqual({ ok: false, reason });
    },
  );

  it('OTP-G09 reissue: bên khác vừa đánh dấu hàng đã dùng sau lần đọc của người gọi: bị từ chối, không cấp mã mới từ hàng đã dùng', async () => {
    const account = await newUnverifiedAccount(db);
    const { id } = await issueDeliverRead(fx, account);
    vi.setSystemTime(at(61)); // qua 60 giây: giới hạn gửi lại không phải lý do từ chối
    const result = await db.transaction(async (em) => {
      await em.query(
        'SELECT COUNT(*) AS n FROM ma_xac_thuc WHERE tai_khoan_id = ?',
        [account.taiKhoanId],
      );
      await db.query(
        'UPDATE ma_xac_thuc SET da_dung_luc = ? WHERE ma_xac_thuc_id = ?',
        [at(5), id],
      );
      return fx.otp.reissue({ maXacThucId: id }, { manager: em });
    });
    expect(result).toEqual({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'USED' },
    });
    expect(await rowsOf(db, account.taiKhoanId)).toHaveLength(1);
  });
});

describe('xác minh đồng thời (DK-29, H8)', () => {
  it(`OTP-G04 xác minh cùng một OTP hai lần đồng thời: một thành công, một bị từ chối; việc của người gọi chạy đúng một lần (${String(ROUNDS)} vòng)`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newUnverifiedAccount(db);
      const { id, code } = await issueDeliverRead(fx, account);
      let callbackRuns = 0;
      const verifyOnce = () =>
        fx.otp.verify(
          { maXacThucId: id, loai: 'DangKy', otp: code },
          { consume: true },
          async ({ manager, otp }) => {
            callbackRuns += 1;
            await manager.insert(BenhNhan, { taiKhoanId: otp.taiKhoanId });
          },
        );
      const results = await Promise.all([verifyOnce(), verifyOnce()]);
      expect(
        results.filter((r) => r.ok),
        `vòng ${String(round)}`,
      ).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toMatchObject({
        failure: { code: 'OTP_SAI', reason: 'USED' },
      });
      expect(callbackRuns).toBe(1);
      expect(
        await db
          .getRepository(BenhNhan)
          .countBy({ taiKhoanId: account.taiKhoanId }),
      ).toBe(1);
    }
  });

  it('OTP-G05 tám lần nhập SAI đồng thời: đếm nguyên tử — dừng đúng ở 5, mã thu hồi, bốn lần đầu OTP_SAI, các lần sau OTP_HET_LUOT', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        fx.otp.verify({
          maXacThucId: id,
          loai: 'DangKy',
          otp: wrongCodeFor(code),
        }),
      ),
    );

    const codes = results.map((r) => (r.ok ? 'OK' : r.failure.code));
    expect(codes.filter((c) => c === 'OTP_SAI')).toHaveLength(
      OTP_MAX_WRONG_ATTEMPTS - 1,
    );
    expect(codes.filter((c) => c === 'OTP_HET_LUOT')).toHaveLength(
      8 - (OTP_MAX_WRONG_ATTEMPTS - 1),
    );
    const counted = results
      .flatMap((r) => (r.ok ? [] : [r.failure.wrongAttempts]))
      .filter((n): n is number => n !== undefined)
      .sort((a, b) => a - b);
    expect(counted).toEqual([1, 2, 3, 4, 5]); // mỗi lần đếm đúng một số, không trùng, không nhảy
    const row = await rowOf(db, id);
    expect(row.soLanNhapSai).toBe(OTP_MAX_WRONG_ATTEMPTS);
    expect(row.thuHoiLuc).not.toBeNull();
  });
});

describe('thứ tự khoá tài khoản → hàng OTP, không deadlock (H8)', () => {
  it(`OTP-G06 pha 2 của mã mới chạy đồng thời với nhập sai vào mã cũ, gửi lại và đọc trạng thái (${String(ROUNDS)} vòng): mọi thao tác kết thúc, không lỗi deadlock`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newUnverifiedAccount(db);
      const first = await issueDeliverRead(fx, account);
      vi.setSystemTime(at(61 + round * 700)); // mỗi vòng một tài khoản riêng nên thời gian chỉ cần qua 60 giây
      const issuedB = await issueOk(fx.otp, registerInput(account.taiKhoanId));
      const operations = [
        fx.otp.deliver(issuedB, recipientOf(account)),
        fx.otp.verify({
          maXacThucId: first.id,
          loai: 'DangKy',
          otp: wrongCodeFor(first.code),
        }),
        fx.otp.verify({
          maXacThucId: first.id,
          loai: 'DangKy',
          otp: first.code,
        }),
        fx.otp.latestStatus(account.taiKhoanId, 'DangKy'),
        fx.otp.reissue({ maXacThucId: first.id }),
      ];
      const settled = await Promise.allSettled(operations);
      const rejected = settled.filter((s) => s.status === 'rejected');
      expect(
        rejected.map((s) => String((s as PromiseRejectedResult).reason)),
        `vòng ${String(round)}`,
      ).toEqual([]);
    }
  });

  it('OTP-G07 cấp mã quên mật khẩu đồng thời với nhập sai và với gửi lại đăng ký của CÙNG tài khoản: không deadlock', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const account = await newUnverifiedAccount(db);
      const first = await issueDeliverRead(fx, account);
      vi.setSystemTime(at(61 + round * 700));
      const settled = await Promise.allSettled([
        fx.otp.issueAndDeliver(
          forgotInput(account.taiKhoanId),
          recipientOf(account),
        ),
        fx.otp.verify({
          maXacThucId: first.id,
          loai: 'DangKy',
          otp: wrongCodeFor(first.code),
        }),
        fx.otp.reissue({ maXacThucId: first.id }),
        fx.otp.verify({
          taiKhoanId: account.taiKhoanId,
          loai: 'QuenMatKhau',
          otp: '000000',
        }),
      ]);
      expect(
        settled.filter((s) => s.status === 'rejected'),
        `vòng ${String(round)}`,
      ).toEqual([]);
    }
  });
});

describe('hành vi MySQL 8.4 thật mà thiết kế dựa vào (kiểm bằng mã chạy thật, không dựa trí nhớ)', () => {
  it('OTP-M01 dưới REPEATABLE READ, đọc THƯỜNG vẫn thấy ảnh chụp cũ còn đọc KHOÁ (FOR UPDATE) thấy hàng vừa commit — lý do đếm giới hạn phải dùng đọc khoá', async () => {
    const account = await newUnverifiedAccount(db);
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const count = async (suffix: string): Promise<number> => {
        const rows = (await runner.query(
          `SELECT ma_xac_thuc_id FROM ma_xac_thuc WHERE tai_khoan_id = ?${suffix}`,
          [account.taiKhoanId],
        )) as unknown[];
        return rows.length;
      };
      expect(await count('')).toBe(0); // tạo ảnh chụp
      await issueOk(fx.otp, registerInput(account.taiKhoanId)); // giao dịch KHÁC, commit
      expect(await count('')).toBe(0); // đọc thường: vẫn ảnh chụp cũ
      expect(await count(' FOR UPDATE')).toBe(1); // đọc khoá: thấy dữ liệu mới nhất
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('OTP-M02 thứ tự gán trong một câu UPDATE của MySQL 8.4: gán sau thấy giá trị cột ĐÃ cập nhật (trái → phải) — vì vậy phép gán thu_hoi_luc được đặt TRƯỚC phép cộng', async () => {
    const account = await newUnverifiedAccount(db);
    const { id } = await issueDeliverRead(fx, account);
    const repo = db.getRepository(MaXacThuc);
    await repo.update({ maXacThucId: id }, { soLanNhapSai: 3 });

    // Thứ tự NGƯỢC (cộng trước, IF sau): nếu MySQL dùng giá trị đã cập nhật (4) thì điều kiện `>= 4` đúng và thu hồi SỚM
    await db.query(
      'UPDATE ma_xac_thuc SET so_lan_nhap_sai = so_lan_nhap_sai + 1, thu_hoi_luc = IF(so_lan_nhap_sai >= 4, ?, thu_hoi_luc) WHERE ma_xac_thuc_id = ?',
      [T0, id],
    );
    const reversed = await rowOf(db, id);
    expect(reversed.soLanNhapSai).toBe(4);
    expect(reversed.thuHoiLuc).not.toBeNull(); // quan sát thực tế: MySQL dùng giá trị đã cập nhật

    // Thứ tự của mã thật (IF trước, cộng sau) trên cùng tình huống: lần thứ 4 KHÔNG thu hồi
    await repo.update(
      { maXacThucId: id },
      { soLanNhapSai: 3, thuHoiLuc: null },
    );
    await db.transaction((em) =>
      fx.repo.recordWrongAttempt(em, id, OTP_MAX_WRONG_ATTEMPTS, T0),
    );
    const ours = await rowOf(db, id);
    expect(ours.soLanNhapSai).toBe(4);
    expect(ours.thuHoiLuc).toBeNull();
    await db.transaction((em) =>
      fx.repo.recordWrongAttempt(em, id, OTP_MAX_WRONG_ATTEMPTS, T0),
    );
    expect((await rowOf(db, id)).thuHoiLuc).not.toBeNull(); // lần thứ 5 thu hồi
  });

  it('OTP-M03 recordWrongAttempt không đụng hàng đã thu hồi hoặc đã dùng (điều kiện nằm trong chính câu UPDATE)', async () => {
    const account = await newUnverifiedAccount(db);
    const { id, code } = await issueDeliverRead(fx, account);
    await fx.otp.verify(
      { maXacThucId: id, loai: 'DangKy', otp: code },
      { consume: true },
    );
    expect(
      await db.transaction((em) =>
        fx.repo.recordWrongAttempt(em, id, OTP_MAX_WRONG_ATTEMPTS, T0),
      ),
    ).toBe(false);
    expect((await rowOf(db, id)).soLanNhapSai).toBe(0);
  });
});
