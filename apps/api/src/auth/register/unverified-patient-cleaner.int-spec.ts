import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  insertMaXacThuc,
  insertPhienDangNhap,
  insertTaiKhoan,
} from '../entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { at } from '../testing/otp-int-helpers.js';
import {
  allAccounts,
  createRegisterFixture,
  type RegisterFixture,
} from '../testing/register-int-helpers.js';

// Task A5 (hàm dùng lại cho job dọn A7) — MySQL 8.4 thật. Mã test case: DK-33 (biên 24 giờ), DK-34, DK-35 (không xoá nhân sự, H1),
// H2 (xoá con trước cha, khoá ngoại không CASCADE); NgungHoatDong là ngoại lệ do người dùng chốt (TRACKING A5-F). Mã CL-nn là [đề xuất].
const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;

let db: DataSource;
let fx: RegisterFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createRegisterFixture(testDb);
});

/** Tài khoản kèm đủ loại hàng con (OTP đăng ký, OTP quên mật khẩu, phiên) tạo `ageSeconds` giây trước "bây giờ". */
async function seed(
  ageSeconds: number,
  overrides: Partial<TaiKhoan> = {},
): Promise<TaiKhoan> {
  const account = await insertTaiKhoan(db, {
    daXacMinhEmail: false,
    thoiDiemTao: at(-ageSeconds),
    ...overrides,
  });
  await insertMaXacThuc(db, account.taiKhoanId, { taoLuc: at(-ageSeconds) });
  await insertMaXacThuc(db, account.taiKhoanId, {
    loai: 'QuenMatKhau',
    hoTenDangKy: null,
    soDienThoaiDangKy: null,
    matKhauBamDangKy: null,
    taoLuc: at(-ageSeconds + 5),
  });
  await insertPhienDangNhap(db, account.taiKhoanId);
  return account;
}

const childrenOf = async (taiKhoanId: string) => ({
  otp: await db.getRepository(MaXacThuc).countBy({ taiKhoanId }),
  sessions: await db.getRepository(PhienDangNhap).countBy({ taiKhoanId }),
});
const exists = async (taiKhoanId: string) =>
  (await db.getRepository(TaiKhoan).countBy({ taiKhoanId })) === 1;
const purge = (taiKhoanId: string) =>
  db.transaction((em) => fx.cleaner.purgeIfExpired(em, taiKhoanId));

describe('purgeIfExpired — xoá Bệnh nhân chưa xác minh quá 24 giờ', () => {
  it('CL-01 xoá ma_xac_thuc, phien_dang_nhap rồi tai_khoan trong một giao dịch; không đụng tài khoản khác (H2, DK-33)', async () => {
    const expired = await seed(DAY + 60); // 24:01
    const other = await seed(DAY + 60, { email: 'khac@example.com' });

    expect(await purge(expired.taiKhoanId)).toBe(true);

    expect(await exists(expired.taiKhoanId)).toBe(false);
    expect(await childrenOf(expired.taiKhoanId)).toEqual({
      otp: 0,
      sessions: 0,
    });
    expect(await exists(other.taiKhoanId)).toBe(true); // chỉ xoá đúng id được gọi
    expect(await childrenOf(other.taiKhoanId)).toEqual({ otp: 2, sessions: 1 });
  });

  it.each([
    [DAY - 60, false, 'T+23:59'],
    [DAY - 1, false, 'T+23:59:59'],
    [DAY, true, 'đúng T+24:00:00 (nửa mở)'],
    [DAY + 1, true, 'T+24:00:01'],
    [DAY + 60, true, 'T+24:01'],
  ])(
    'CL-02 biên 24 giờ: tuổi %i giây (%s) → xoá = %s',
    async (age, expected) => {
      const account = await seed(age);
      expect(await purge(account.taiKhoanId)).toBe(expected);
      expect(await exists(account.taiKhoanId)).toBe(!expected);
      expect(await childrenOf(account.taiKhoanId)).toEqual(
        expected ? { otp: 0, sessions: 0 } : { otp: 2, sessions: 1 },
      );
    },
  );

  it('CL-03 id không tồn tại → false, không lỗi', async () => {
    expect(await purge('987654321')).toBe(false);
  });
});

describe('purgeIfExpired — KHÔNG BAO GIỜ xoá những loại này dù quá hạn rất lâu (DK-34, DK-35, H1)', () => {
  it.each([
    ['Bệnh nhân đã xác minh', { daXacMinhEmail: true }],
    [
      'Bác sĩ chờ kích hoạt (cũng chưa xác minh)',
      { loaiTaiKhoan: 'BacSi', trangThai: 'ChoKichHoat', matKhauBam: null },
    ],
    [
      'Lễ tân chờ kích hoạt',
      { loaiTaiKhoan: 'LeTan', trangThai: 'ChoKichHoat', matKhauBam: null },
    ],
    ['Quản trị viên chưa xác minh', { loaiTaiKhoan: 'QuanTriVien' }],
    ['Bác sĩ đang hoạt động chưa xác minh', { loaiTaiKhoan: 'BacSi' }],
    [
      'Bệnh nhân chưa xác minh bị ngưng hoạt động (admin khoá có chủ ý)',
      { trangThai: 'NgungHoatDong' },
    ],
  ] as const)('CL-04 %s', async (_label, overrides) => {
    const account = await seed(400 * DAY, overrides);

    expect(await purge(account.taiKhoanId)).toBe(false);

    expect(await exists(account.taiKhoanId)).toBe(true);
    expect(await childrenOf(account.taiKhoanId)).toEqual({
      otp: 2,
      sessions: 1,
    });
  });

  it.each([
    ['Bệnh nhân đã xác minh', { daXacMinhEmail: true }],
    [
      'Bác sĩ chờ kích hoạt',
      { loaiTaiKhoan: 'BacSi', trangThai: 'ChoKichHoat', matKhauBam: null },
    ],
    ['Bệnh nhân NgungHoatDong', { trangThai: 'NgungHoatDong' }],
  ] as const)(
    'CL-05 câu DELETE của repository TỰ nó cũng giữ điều kiện bảo vệ (không chỉ dựa vào kiểm ở tầng dịch vụ): %s',
    async (_label, overrides) => {
      const account = await insertTaiKhoan(db, {
        daXacMinhEmail: false,
        thoiDiemTao: at(-400 * DAY),
        ...overrides,
      });
      const deleted = await db.transaction((em) =>
        fx.accounts.deleteUnverifiedPatient(em, account.taiKhoanId),
      );
      expect(deleted).toBe(false);
      expect(await exists(account.taiKhoanId)).toBe(true);
    },
  );

  it('CL-06 điều kiện bảo vệ ở repository: Bệnh nhân chưa xác minh đang hoạt động thì xoá được', async () => {
    const account = await insertTaiKhoan(db, { daXacMinhEmail: false });
    expect(
      await db.transaction((em) =>
        fx.accounts.deleteUnverifiedPatient(em, account.taiKhoanId),
      ),
    ).toBe(true);
    expect(await exists(account.taiKhoanId)).toBe(false);
  });
});

describe('purgeIfExpired — nguyên tử và không xoá lặng lẽ', () => {
  it('CL-07 chạy trong giao dịch của người gọi: người gọi ROLLBACK sau khi xoá thì mọi thứ trở lại nguyên vẹn', async () => {
    const account = await seed(DAY + 1);

    await expect(
      db.transaction(async (em) => {
        expect(await fx.cleaner.purgeIfExpired(em, account.taiKhoanId)).toBe(
          true,
        );
        throw new Error('người gọi hoàn tác');
      }),
    ).rejects.toThrow('người gọi hoàn tác');

    expect(await exists(account.taiKhoanId)).toBe(true);
    expect(await childrenOf(account.taiKhoanId)).toEqual({
      otp: 2,
      sessions: 1,
    });
  });

  it('CL-08 lỗi khi xoá bảng con giữa chừng: ném lỗi, người gọi ROLLBACK, tài khoản và hàng con còn nguyên', async () => {
    const account = await seed(DAY + 1);
    vi.spyOn(fx.sessions, 'deleteByAccount').mockRejectedValueOnce(
      new Error('lỗi giả lập khi xoá phiên'),
    );

    await expect(purge(account.taiKhoanId)).rejects.toThrow('lỗi giả lập');

    expect(await exists(account.taiKhoanId)).toBe(true);
    expect(await childrenOf(account.taiKhoanId)).toEqual({
      otp: 2,
      sessions: 1,
    });
  });

  it('CL-09 còn bảng khác tham chiếu (thong_bao) → khoá ngoại chặn: ném lỗi, log ERROR, ROLLBACK cả việc xoá hàng con, không xoá lặng lẽ', async () => {
    const account = await seed(DAY + 1);
    await db.query(
      'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (?, ?, ?, ?)',
      [account.taiKhoanId, 'Thông báo thử', 'KiemThu', at(-DAY)],
    );

    await expect(purge(account.taiKhoanId)).rejects.toThrow();

    expect(await exists(account.taiKhoanId)).toBe(true);
    expect(await childrenOf(account.taiKhoanId)).toEqual({
      otp: 2,
      sessions: 1,
    }); // đã hoàn tác việc xoá con
    const rows: { n: string }[] = await db.query(
      'SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id = ?',
      [account.taiKhoanId],
    );
    expect(Number(rows[0]?.n)).toBe(1);
    const errorLog = logs.find((line) => /khoá ngoại/i.test(line));
    expect(errorLog).toBeDefined();
    expect(errorLog).toContain(account.taiKhoanId);
    expect(errorLog).not.toContain(account.email); // log chỉ có mã tài khoản, không có email
  });

  it('CL-10 xoá nhiều tài khoản quá hạn liên tiếp (cách job A7 sẽ gọi: mỗi id một giao dịch)', async () => {
    const ids = [
      (await seed(DAY + 10, { email: 'a1@example.com' })).taiKhoanId,
      (await seed(DAY + 20, { email: 'a2@example.com' })).taiKhoanId,
      (await seed(DAY + 30, { email: 'a3@example.com' })).taiKhoanId,
    ];
    for (const id of ids) expect(await purge(id)).toBe(true);
    expect(await allAccounts(db)).toHaveLength(0);
    expect(await db.getRepository(MaXacThuc).count()).toBe(0);
    expect(await db.getRepository(PhienDangNhap).count()).toBe(0);
  });
});
