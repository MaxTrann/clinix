import { QueryFailedError, type DataSource } from 'typeorm';
import { vi } from 'vitest';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { OTP_RESEND_MIN_INTERVAL_MS, OTP_TTL_MS } from '../auth.constants.js';
import { BenhNhan } from '../entities/benh-nhan.entity.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  insertMaXacThuc,
  insertPhienDangNhap,
  insertTaiKhoan,
} from '../entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { T0, at, rowOf, rowsOf } from '../testing/otp-int-helpers.js';
import { readOtpFromMail } from '../testing/otp-test-helpers.js';
import {
  REGISTER_PASSWORD,
  allAccounts,
  allOtpRows,
  appExceptionOf,
  codeOfMail,
  createRegisterFixture,
  registerBody,
  type RegisterFixture,
} from '../testing/register-int-helpers.js';

// Task A5 — POST /auth/register ở tầng dịch vụ, MySQL 8.4 THẬT. Mã test case: DK-01, 11, 12–17, 25, 26, 33, 36–38, 41–43, 48 của PLAN mục 7.1.
// Mã nội bộ REG-nn là [đề xuất]. Các ca chạy đua và hành vi khoá của MySQL nằm ở register.service.concurrency.int-spec.ts.
// Đồng hồ giả chỉ giả Date (T0 = 2026-11-02, xa "bây giờ" thật để lẫn đồng hồ ứng dụng với NOW() của DB làm test đỏ).
const DAY = 24 * 60 * 60;

let db: DataSource;
let fx: RegisterFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createRegisterFixture(testDb);
});

const goTo = (seconds: number) => vi.setSystemTime(at(seconds));
const otpMailCount = () => fx.mail.attempts.length;

describe('nhánh 1 — email mới (DK-01, DK-17, DK-36)', () => {
  it('REG-01 tạo tài khoản Bệnh nhân chưa xác minh + một hàng OTP đã gửi; đáp ứng đủ ba trường, KHÔNG có OTP (DK-01, DK-40)', async () => {
    const result = await fx.service.register(registerBody());

    expect(Object.keys(result).sort()).toEqual([
      'coTheGuiLaiLuc',
      'hetHanLuc',
      'maXacThucId',
    ]);
    expect(result.hetHanLuc).toEqual(at(OTP_TTL_MS / 1000));
    expect(result.coTheGuiLaiLuc).toEqual(
      at(OTP_RESEND_MIN_INTERVAL_MS / 1000),
    );

    const accounts = await allAccounts(db);
    expect(accounts).toHaveLength(1);
    const account = accounts[0] as TaiKhoan;
    expect(account).toMatchObject({
      hoTen: 'Nguyễn Văn A',
      email: 'dang.ky@example.com',
      soDienThoai: '0901234567',
      loaiTaiKhoan: 'BenhNhan',
      trangThai: 'DangHoatDong',
      daXacMinhEmail: false,
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
    expect(account.matKhauBam).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/); // S6, đúng thứ tự tham số thư viện ghi
    expect(
      await fx.hasher.verify(account.matKhauBam ?? '', REGISTER_PASSWORD),
    ).toBe(true);
    expect(await db.getRepository(BenhNhan).count()).toBe(0); // hồ sơ bệnh nhân chỉ tạo khi OTP đúng (A6)

    const rows = await allOtpRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      maXacThucId: result.maXacThucId,
      taiKhoanId: account.taiKhoanId,
      loai: 'DangKy',
      hoTenDangKy: 'Nguyễn Văn A',
      soDienThoaiDangKy: '0901234567',
      matKhauBamDangKy: account.matKhauBam,
      soLanNhapSai: 0,
      thuHoiLuc: null,
      daDungLuc: null,
    });
    expect(rows[0]?.daGuiLuc).toEqual(at(0)); // gửi thành công ngay
    expect(rows[0]?.maBam).toMatch(/^[0-9a-f]{64}$/); // HMAC, không phải mã
  });

  it('REG-02 mốc thời gian lấy từ đồng hồ ứng dụng và cắt xuống giây, không dùng NOW() của DB (thoi_diem_tao, tao_luc)', async () => {
    vi.setSystemTime(new Date(T0.getTime() + 900));
    await fx.service.register(registerBody());
    const [account] = await allAccounts(db);
    expect(account?.thoiDiemTao).toEqual(T0); // 08:00:00.900 → 08:00:00, và là ngày 2/11/2026 chứ không phải hôm nay
    const [row] = await allOtpRows(db);
    expect(row?.taoLuc).toEqual(T0);
  });

  it('REG-03 thư gửi tới email đã lưu, đúng một thư, mã trong thư khớp hàng OTP, thư chào đúng tên và KHÔNG chứa mật khẩu', async () => {
    const result = await fx.service.register(registerBody());

    expect(fx.mail.attempts).toHaveLength(1);
    expect(fx.mail.sent).toHaveLength(1);
    const mail = fx.mail.sent[0];
    expect(mail?.to).toBe('dang.ky@example.com');
    expect(mail?.text).toContain('Nguyễn Văn A');
    expect(mail?.text).toContain('10 phút');
    expect(mail?.text).not.toContain(REGISTER_PASSWORD);

    // mã trong thư là mã thật của hàng OTP: xác minh được bằng OtpService (A6 sẽ dùng đúng đường này)
    const verified = await fx.otp.verify({
      maXacThucId: result.maXacThucId,
      loai: 'DangKy',
      otp: codeOfMail(fx.mail, 0),
    });
    expect(verified.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(codeOfMail(fx.mail, 0));
  });

  it('REG-04 email khác hoa/thường ở phần trước @ là CÙNG tài khoản (UNIQUE không phân biệt hoa thường), không tạo thêm (DK-17)', async () => {
    await fx.service.register(
      registerBody({ email: 'nguyen.van@example.com' }),
    );
    goTo(61);
    await fx.service.register(
      registerBody({ email: 'Nguyen.Van@example.com' }),
    );

    const accounts = await allAccounts(db);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.email).toBe('nguyen.van@example.com'); // giữ nguyên dạng lúc tạo
    expect(await rowsOf(db, accounts[0]?.taiKhoanId ?? '')).toHaveLength(2);
    // thư thứ hai gửi tới email ĐÃ LƯU trong tai_khoan, không tới chuỗi gõ ở lần sau
    expect(fx.mail.attempts.map((m) => m.to)).toEqual([
      'nguyen.van@example.com',
      'nguyen.van@example.com',
    ]);
  });

  it('REG-05 đăng ký lại cùng email sau khi tài khoản cũ đã bị xoá thì tạo mới bình thường, hạn mức OTP tính lại từ đầu (DK-36)', async () => {
    await fx.service.register(registerBody());
    const [old] = await allAccounts(db);
    goTo(DAY + 5);
    const result = await fx.service.register(registerBody());

    const accounts = await allAccounts(db);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.taiKhoanId).not.toBe(old?.taiKhoanId);
    expect(await rowsOf(db, accounts[0]?.taiKhoanId ?? '')).toHaveLength(1);
    expect(result.hetHanLuc).toEqual(at(DAY + 5 + OTP_TTL_MS / 1000));
  });
});

describe('nhánh 2 — email đã dùng (DK-11, DK-41)', () => {
  it.each([
    ['Bệnh nhân đã xác minh', { daXacMinhEmail: true }],
    ['Bác sĩ đang hoạt động', { daXacMinhEmail: true, loaiTaiKhoan: 'BacSi' }],
    ['Lễ tân đang hoạt động', { daXacMinhEmail: true, loaiTaiKhoan: 'LeTan' }],
    [
      'Quản trị viên (chưa xác minh)',
      { daXacMinhEmail: false, loaiTaiKhoan: 'QuanTriVien' },
    ],
    [
      'nhân sự chờ kích hoạt, chưa có mật khẩu, tạo từ rất lâu (không bị dọn, H1)',
      {
        daXacMinhEmail: false,
        loaiTaiKhoan: 'BacSi',
        trangThai: 'ChoKichHoat',
        matKhauBam: null,
        thoiDiemTao: at(-30 * DAY),
      },
    ],
  ] as const)(
    'REG-06 %s → 409 EMAIL_DA_DUNG, không tạo/đổi/xoá gì, không băm, không thư',
    async (_label, overrides) => {
      await insertTaiKhoan(db, { email: 'dang.ky@example.com', ...overrides });
      const before = await allAccounts(db); // ảnh chụp từng cột TRƯỚC khi gọi
      const hash = vi.spyOn(fx.hasher, 'hash');

      const error = await appExceptionOf(fx.service.register(registerBody()));

      expect(error.getStatus()).toBe(409);
      expect(error.maLoi).toBe('EMAIL_DA_DUNG');
      expect(await allOtpRows(db)).toHaveLength(0);
      expect(otpMailCount()).toBe(0);
      expect(hash).not.toHaveBeenCalled(); // từ chối sớm: không tốn một lần băm Argon2id
      expect(await allAccounts(db)).toEqual(before); // không tạo, không sửa, không xoá
    },
  );

  it('REG-07 so email không phân biệt hoa/thường cả với tài khoản đã xác minh (EMAIL_DA_DUNG)', async () => {
    await insertTaiKhoan(db, {
      email: 'Da.Xac.Minh@example.com',
      daXacMinhEmail: true,
    });
    const error = await appExceptionOf(
      fx.service.register(registerBody({ email: 'da.xac.minh@example.com' })),
    );
    expect(error.maLoi).toBe('EMAIL_DA_DUNG');
    expect(await allAccounts(db)).toHaveLength(1);
  });

  it.each([
    ['còn trong 24 giờ', 60],
    ['đã quá 24 giờ rất lâu', 30 * DAY],
  ])(
    'REG-08 Bệnh nhân chưa xác minh nhưng NgungHoatDong (admin khoá có chủ ý), %s → EMAIL_DA_DUNG, KHÔNG xoá lười (quyết định A5-F)',
    async (_label, ageSeconds) => {
      const locked = await insertTaiKhoan(db, {
        email: 'dang.ky@example.com',
        daXacMinhEmail: false,
        trangThai: 'NgungHoatDong',
        thoiDiemTao: at(-ageSeconds),
      });
      await insertMaXacThuc(db, locked.taiKhoanId, { taoLuc: at(-ageSeconds) });
      await insertPhienDangNhap(db, locked.taiKhoanId);

      const error = await appExceptionOf(fx.service.register(registerBody()));

      expect(error.maLoi).toBe('EMAIL_DA_DUNG');
      expect(await allAccounts(db)).toHaveLength(1);
      expect(await db.getRepository(MaXacThuc).count()).toBe(1);
      expect(await db.getRepository(PhienDangNhap).count()).toBe(1);
      expect(otpMailCount()).toBe(0);
    },
  );
});

describe('nhánh 4 — đăng ký lại khi chưa xác minh còn hạn (DK-12..DK-16, DK-38, DK-42, DK-43)', () => {
  it('REG-09 hàng OTP MỚI mang dữ liệu lần này, tai_khoan KHÔNG đổi một cột nào; gửi thành công thì hàng cũ bị thu hồi (DK-12)', async () => {
    const first = await fx.service.register(registerBody());
    const before = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ email: 'dang.ky@example.com' });

    goTo(61);
    const second = await fx.service.register(
      registerBody({
        hoTen: 'Kẻ Khác',
        soDienThoai: '0987654321',
        matKhau: 'Mat-Khau-Moi-77?',
      }),
    );

    const after = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ email: 'dang.ky@example.com' });
    expect(after).toEqual(before); // KHÔNG đổi: họ tên, SĐT, mật khẩu, thoi_diem_tao… giữ của lần đầu cho tới khi OTP đúng

    expect(BigInt(second.maXacThucId)).toBeGreaterThan(
      BigInt(first.maXacThucId),
    );
    const newRow = await rowOf(db, second.maXacThucId);
    expect(newRow).toMatchObject({
      hoTenDangKy: 'Kẻ Khác',
      soDienThoaiDangKy: '0987654321',
    });
    expect(newRow.daGuiLuc).toEqual(at(61));
    expect(
      await fx.hasher.verify(newRow.matKhauBamDangKy ?? '', 'Mat-Khau-Moi-77?'),
    ).toBe(true);
    expect(newRow.matKhauBamDangKy).not.toBe(before.matKhauBam);

    const oldRow = await rowOf(db, first.maXacThucId);
    expect(oldRow.thuHoiLuc).toEqual(at(61)); // thu hồi SAU khi hàng mới gửi thành công
    expect(otpMailCount()).toBe(2);
  });

  it.each([
    [59, 'quá sớm', 1],
    [60, 'đúng 60 giây', 0],
  ])(
    'REG-10 đăng ký lại sau %i giây (%s) (DK-13, DK-14)',
    async (seconds, _label, waitSeconds) => {
      await fx.service.register(registerBody());
      goTo(seconds);
      if (waitSeconds === 0) {
        const second = await fx.service.register(registerBody());
        expect(second.maXacThucId).toBeDefined();
        expect(otpMailCount()).toBe(2);
        return;
      }
      const error = await appExceptionOf(fx.service.register(registerBody()));
      expect(error.getStatus()).toBe(429);
      expect(error.maLoi).toBe('GUI_LAI_QUA_SOM');
      expect(error.getResponse()).toMatchObject({
        chiTiet: { soGiayCho: waitSeconds },
      });
      expect(otpMailCount()).toBe(1); // không gửi thêm thư
      expect(await allOtpRows(db)).toHaveLength(1); // không có hàng thừa
    },
  );

  it('REG-11 tối đa 5 mã trong 1 giờ: lần thứ 5 vẫn được, lần thứ 6 bị từ chối; hết 1 giờ kể từ mã đầu thì được lại (DK-15)', async () => {
    for (const seconds of [0, 61, 122, 183, 244]) {
      goTo(seconds);
      await fx.service.register(registerBody());
    }
    goTo(305);
    const error = await appExceptionOf(fx.service.register(registerBody()));
    expect(error.maLoi).toBe('GUI_LAI_QUA_SOM');
    expect(error.getResponse()).toMatchObject({ chiTiet: { soGiayCho: 3295 } }); // 3600 - 305
    expect(await allOtpRows(db)).toHaveLength(5);

    goTo(3600); // mã đầu (tao_luc = 0) đúng 1 giờ tuổi: không còn được đếm (cửa sổ nửa mở)
    await fx.service.register(registerBody());
    expect(await allOtpRows(db)).toHaveLength(6);
  });

  it('REG-12 gửi lại KHÔNG kéo dài hạn 24 giờ của tài khoản: ở T+23:00 thoi_diem_tao vẫn là của lần tạo (DK-38)', async () => {
    await fx.service.register(registerBody());
    goTo(23 * 60 * 60);
    await fx.service.register(registerBody());
    const [account] = await allAccounts(db);
    expect(account?.thoiDiemTao).toEqual(T0);
    expect(await allAccounts(db)).toHaveLength(1);
  });

  it('REG-13 CHIẾM TRƯỚC: kẻ xấu đăng ký (P), nạn nhân đăng ký (V): mã của kẻ xấu bị thay thế; nạn nhân xác minh được dữ liệu của CHÍNH MÌNH (DK-16, DK-42)', async () => {
    const attacker = await fx.service.register(
      registerBody({ hoTen: 'Kẻ Xấu', matKhau: 'Mat-Khau-Ke-Xau-1!' }),
    );
    goTo(61);
    const victim = await fx.service.register(
      registerBody({ hoTen: 'Nạn Nhân', matKhau: 'Mat-Khau-Nan-Nhan-1!' }),
    );

    // lần 2 đã gửi thành công nên lần 1 (của kẻ xấu) bị thay thế: mã lần 1 không dùng được nữa dù còn hạn và đúng
    const stale = await fx.otp.verify({
      maXacThucId: attacker.maXacThucId,
      loai: 'DangKy',
      otp: codeOfMail(fx.mail, 0),
    });
    expect(stale).toMatchObject({
      ok: false,
      failure: { code: 'OTP_BI_THAY_THE' },
    });

    const ok = await fx.otp.verify({
      maXacThucId: victim.maXacThucId,
      loai: 'DangKy',
      otp: codeOfMail(fx.mail, 1),
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.otp.registration?.hoTen).toBe('Nạn Nhân');
    expect(
      await fx.hasher.verify(
        ok.otp.registration?.matKhauBam ?? '',
        'Mat-Khau-Nan-Nhan-1!',
      ),
    ).toBe(true);
    expect(
      await fx.hasher.verify(
        ok.otp.registration?.matKhauBam ?? '',
        'Mat-Khau-Ke-Xau-1!',
      ),
    ).toBe(false);
  });

  it('REG-14 kẻ xấu đăng ký LẠI (lần 3) khi mail gửi thành công thì lần 2 của nạn nhân bị thay thế: nhập mã mới nhất kèm id lần 2 bị từ chối (DK-43)', async () => {
    await fx.service.register(registerBody({ matKhau: 'Mat-Khau-Ke-Xau-1!' }));
    goTo(61);
    const victim = await fx.service.register(
      registerBody({ matKhau: 'Mat-Khau-Nan-Nhan-1!' }),
    );
    goTo(122);
    await fx.service.register(registerBody({ matKhau: 'Mat-Khau-Ke-Xau-2!' }));

    const result = await fx.otp.verify({
      maXacThucId: victim.maXacThucId, // id lần 2
      loai: 'DangKy',
      otp: codeOfMail(fx.mail, 2), // mã của email MỚI NHẤT (lần 3)
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { code: 'OTP_BI_THAY_THE' },
    });
  });
});

describe('nhánh 3 — quá 24 giờ thì xoá lười rồi tạo mới (DK-33, DK-37)', () => {
  async function seedExpiredAccount(ageSeconds: number) {
    const old = await insertTaiKhoan(db, {
      email: 'dang.ky@example.com',
      hoTen: 'Chủ Cũ',
      daXacMinhEmail: false,
      thoiDiemTao: at(-ageSeconds),
    });
    await insertMaXacThuc(db, old.taiKhoanId, {
      taoLuc: at(-ageSeconds),
      daGuiLuc: at(-ageSeconds),
    });
    await insertMaXacThuc(db, old.taiKhoanId, {
      taoLuc: at(-ageSeconds + 100),
    });
    await insertPhienDangNhap(db, old.taiKhoanId);
    return old;
  }

  it('REG-15 quá 24 giờ: xoá tài khoản cũ cùng ma_xac_thuc và phien_dang_nhap rồi tạo tài khoản MỚI; không gửi thư nào cho tài khoản cũ (DK-37)', async () => {
    const old = await seedExpiredAccount(DAY + 1);

    const result = await fx.service.register(
      registerBody({ hoTen: 'Chủ Mới' }),
    );

    expect(
      await db.getRepository(TaiKhoan).countBy({ taiKhoanId: old.taiKhoanId }),
    ).toBe(0);
    expect(
      await db.getRepository(MaXacThuc).countBy({ taiKhoanId: old.taiKhoanId }),
    ).toBe(0);
    expect(
      await db
        .getRepository(PhienDangNhap)
        .countBy({ taiKhoanId: old.taiKhoanId }),
    ).toBe(0);
    const accounts = await allAccounts(db);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ hoTen: 'Chủ Mới', thoiDiemTao: at(0) });
    expect(accounts[0]?.taiKhoanId).not.toBe(old.taiKhoanId);
    expect(await allOtpRows(db)).toHaveLength(1);
    expect((await allOtpRows(db))[0]?.maXacThucId).toBe(result.maXacThucId);
    expect(fx.mail.attempts).toHaveLength(1);
  });

  it.each([
    [DAY - 60, 'T+23:59 (chưa quá hạn)'],
    [DAY - 1, 'T+23:59:59 (chưa quá hạn)'],
  ])(
    'REG-16 %s: KHÔNG xoá; đi tiếp nhánh 4 trên chính tài khoản cũ (DK-33)',
    async (ageSeconds) => {
      const old = await seedExpiredAccount(ageSeconds);
      await fx.service.register(registerBody());
      expect(
        await db
          .getRepository(TaiKhoan)
          .countBy({ taiKhoanId: old.taiKhoanId }),
      ).toBe(1);
      expect(await allAccounts(db)).toHaveLength(1);
      expect((await allAccounts(db))[0]?.hoTen).toBe('Chủ Cũ'); // tai_khoan không đổi
    },
  );

  it('REG-17 đúng 24:00:00 là hết hạn (nửa mở): xoá lười', async () => {
    const old = await seedExpiredAccount(DAY);
    await fx.service.register(registerBody());
    expect(
      await db.getRepository(TaiKhoan).countBy({ taiKhoanId: old.taiKhoanId }),
    ).toBe(0);
  });

  it('REG-18 lỗi giữa chừng (sau khi xoá, trước khi commit) ROLLBACK cả việc xoá: tài khoản cũ và mọi hàng con còn nguyên, không có tài khoản mới', async () => {
    const old = await seedExpiredAccount(DAY + 1);
    vi.spyOn(fx.otp, 'issue').mockRejectedValueOnce(new Error('lỗi giả lập'));

    await expect(fx.service.register(registerBody())).rejects.toThrow(
      'lỗi giả lập',
    );

    expect(await allAccounts(db)).toHaveLength(1);
    expect((await allAccounts(db))[0]?.taiKhoanId).toBe(old.taiKhoanId);
    expect(
      await db.getRepository(MaXacThuc).countBy({ taiKhoanId: old.taiKhoanId }),
    ).toBe(2);
    expect(
      await db
        .getRepository(PhienDangNhap)
        .countBy({ taiKhoanId: old.taiKhoanId }),
    ).toBe(1);
    expect(otpMailCount()).toBe(0);
  });

  it('REG-19 còn bảng khác tham chiếu (thong_bao) làm khoá ngoại chặn xoá: ROLLBACK, log ERROR, lỗi 500, KHÔNG xoá lặng lẽ', async () => {
    const old = await seedExpiredAccount(DAY + 1);
    await db.query(
      'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (?, ?, ?, ?)',
      [old.taiKhoanId, 'Thông báo thử', 'KiemThu', at(-DAY)],
    );

    await expect(fx.service.register(registerBody())).rejects.toThrow();

    expect(await allAccounts(db)).toHaveLength(1);
    expect((await allAccounts(db))[0]?.taiKhoanId).toBe(old.taiKhoanId);
    expect(
      await db.getRepository(MaXacThuc).countBy({ taiKhoanId: old.taiKhoanId }),
    ).toBe(2); // hàng con xoá trước đó đã được hoàn lại
    expect(
      await db
        .getRepository(PhienDangNhap)
        .countBy({ taiKhoanId: old.taiKhoanId }),
    ).toBe(1);
    const notifications: { n: string }[] = await db.query(
      'SELECT COUNT(*) AS n FROM thong_bao',
    );
    expect(Number(notifications[0]?.n)).toBe(1);
    expect(otpMailCount()).toBe(0);
    expect(logs.some((line) => /khoá ngoại|tham chiếu/i.test(line))).toBe(true);
    expect(logs.join('\n')).not.toContain(REGISTER_PASSWORD);
  });
});

describe('gửi mail lỗi → 503 GUI_MAIL_LOI (DK-25, DK-26, DK-48)', () => {
  it('REG-20 đăng ký lần đầu mà gửi lỗi: tài khoản VẪN còn, hàng OTP bị thu hồi và chưa gửi, không xác minh được bằng hàng đó, không bị đếm sai (DK-25)', async () => {
    fx.mail.failNextWith('AUTH');

    const error = await appExceptionOf(fx.service.register(registerBody()));

    expect(error.getStatus()).toBe(503);
    expect(error.maLoi).toBe('GUI_MAIL_LOI');
    const [account] = await allAccounts(db);
    expect(account).toBeDefined();
    const [row] = await allOtpRows(db);
    expect(row).toMatchObject({ daGuiLuc: null, soLanNhapSai: 0 });
    expect(row?.thuHoiLuc).not.toBeNull();
    expect(error.getResponse()).toMatchObject({
      maLoi: 'GUI_MAIL_LOI',
      chiTiet: {
        maXacThucId: row?.maXacThucId,
        coTheGuiLaiLuc: at(60).toISOString(),
      },
    });

    const attempt = fx.mail.attempts[0];
    if (!attempt) throw new Error('thiếu thư');
    const verified = await fx.otp.verify({
      maXacThucId: row?.maXacThucId ?? '',
      loai: 'DangKy',
      otp: readOtpFromMail(attempt), // mã đúng nhưng thư chưa tới nơi
    });
    expect(verified).toMatchObject({
      ok: false,
      failure: { code: 'OTP_SAI', reason: 'NOT_SENT' },
    });
    expect((await rowOf(db, row?.maXacThucId ?? '')).soLanNhapSai).toBe(0);
  });

  it.each([
    'AUTH',
    'TIMEOUT',
    'CONNECTION',
    'REJECTED',
    'TLS',
    'NOT_CONFIGURED',
    'UNKNOWN',
  ] as const)(
    'REG-21 lỗi SMTP loại %s đều ra CÙNG một đáp ứng, không lộ loại lỗi hay chữ của máy chủ SMTP',
    async (kind) => {
      fx.mail.failNextWith(kind);
      const error = await appExceptionOf(
        fx.service.register(
          registerBody({ email: `${kind.toLowerCase()}@example.com` }),
        ),
      );
      const body = error.getResponse() as {
        maLoi: string;
        thongBao: string;
        chiTiet: object;
      };
      expect(body.maLoi).toBe('GUI_MAIL_LOI');
      expect(body.thongBao).toBe(
        'Không gửi được email. Vui lòng thử lại sau ít phút.',
      );
      expect(Object.keys(body.chiTiet).sort()).toEqual([
        'coTheGuiLaiLuc',
        'maXacThucId',
      ]);
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/smtp|auth|timeout|tls|connection/i);
      expect(text).not.toContain(kind);
    },
  );

  it('REG-22 gửi lỗi khi đang có hàng cũ còn hạn: hàng mới bị thu hồi (chưa gửi), hàng cũ còn dùng được và KHÔNG bị thay thế (DK-26)', async () => {
    const first = await fx.service.register(registerBody());
    goTo(61);
    fx.mail.failNextWith('CONNECTION');
    const error = await appExceptionOf(fx.service.register(registerBody()));
    expect(error.maLoi).toBe('GUI_MAIL_LOI');

    const oldRow = await rowOf(db, first.maXacThucId);
    expect(oldRow.thuHoiLuc).toBeNull(); // KHÔNG thu hồi mã cũ khi mã mới gửi lỗi
    const result = await fx.otp.verify({
      maXacThucId: first.maXacThucId,
      loai: 'DangKy',
      otp: codeOfMail(fx.mail, 0),
    });
    expect(result.ok).toBe(true);
  });

  it('REG-23 hàng gửi lỗi VẪN tính vào cả hai giới hạn: ngay sau lỗi, đăng ký lại bị GUI_LAI_QUA_SOM; đủ 5 hàng kể cả hàng lỗi thì hàng thứ 6 bị từ chối (DK-26)', async () => {
    fx.mail.failNextWith('AUTH');
    await appExceptionOf(fx.service.register(registerBody()));
    goTo(30);
    const tooSoon = await appExceptionOf(fx.service.register(registerBody()));
    expect(tooSoon.maLoi).toBe('GUI_LAI_QUA_SOM');
    expect(tooSoon.getResponse()).toMatchObject({ chiTiet: { soGiayCho: 30 } });

    // 4 hàng tiếp theo, đều gửi lỗi: cùng với hàng đầu là 5 hàng lỗi
    for (const seconds of [61, 122, 183, 244]) {
      goTo(seconds);
      fx.mail.failNextWith('AUTH');
      expect(
        (await appExceptionOf(fx.service.register(registerBody()))).maLoi,
      ).toBe('GUI_MAIL_LOI');
    }
    goTo(305);
    const limited = await appExceptionOf(fx.service.register(registerBody()));
    expect(limited.maLoi).toBe('GUI_LAI_QUA_SOM');
    expect(await allOtpRows(db)).toHaveLength(5);
  });

  it('REG-24 sau gửi lỗi, "Gửi lại mã" bằng chính maXacThucId của hàng lỗi được phép và sao chép dữ liệu đăng ký (DK-48)', async () => {
    fx.mail.failNextWith('AUTH');
    const error = await appExceptionOf(
      fx.service.register(registerBody({ hoTen: 'Người Gửi Lại' })),
    );
    const failedId = (
      error.getResponse() as { chiTiet: { maXacThucId: string } }
    ).chiTiet.maXacThucId;

    goTo(61);
    const reissued = await fx.otp.reissue({ maXacThucId: failedId });
    expect(reissued.ok).toBe(true);
    if (!reissued.ok) return;
    await fx.otp.deliver(reissued.issued, {
      email: 'dang.ky@example.com',
      fullName: 'Người Gửi Lại',
    });
    const row = await rowOf(db, reissued.issued.maXacThucId);
    expect(row.hoTenDangKy).toBe('Người Gửi Lại');
    expect(row.daGuiLuc).toEqual(at(61));
  });
});

describe('vòng thử tối đa 3 lần khi đua với yêu cầu khác', () => {
  it('REG-25 đọc thấy "chưa có" nhưng lúc chèn bị trùng khoá (người khác vừa tạo) → làm lại từ đầu và đi tiếp nhánh 4; băm mật khẩu chỉ MỘT lần', async () => {
    await fx.service.register(registerBody()); // yêu cầu "thắng cuộc" đã tạo tài khoản
    goTo(61);
    const realPeek = fx.accounts.findByEmail.bind(fx.accounts);
    const peek = vi
      .spyOn(fx.accounts, 'findByEmail')
      .mockImplementationOnce(() => Promise.resolve(null)) // lần đọc đầu "chưa thấy"
      .mockImplementation(realPeek);
    const insert = vi.spyOn(fx.accounts, 'insertPatient');
    const hash = vi.spyOn(fx.hasher, 'hash');

    const result = await fx.service.register(registerBody());

    expect(result.maXacThucId).toBeDefined();
    expect(peek).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledTimes(1); // lần chèn đầu đã bị 1062
    expect(hash).toHaveBeenCalledTimes(1);
    expect(await allAccounts(db)).toHaveLength(1);
    expect(await allOtpRows(db)).toHaveLength(2);
  });

  it('REG-26 đọc thấy có nhưng lúc khoá thì hàng đã biến mất → làm lại từ đầu và tạo mới', async () => {
    const realPeek = fx.accounts.findByEmail.bind(fx.accounts);
    const peek = vi
      .spyOn(fx.accounts, 'findByEmail')
      .mockImplementationOnce(() =>
        Promise.resolve({
          taiKhoanId: '999',
          email: 'dang.ky@example.com',
          loaiTaiKhoan: 'BenhNhan',
          daXacMinhEmail: false,
          trangThai: 'DangHoatDong',
          thoiDiemTao: T0,
        } as TaiKhoan),
      )
      .mockImplementation(realPeek);

    await fx.service.register(registerBody());

    expect(peek).toHaveBeenCalledTimes(2);
    expect(await allAccounts(db)).toHaveLength(1);
  });

  it('REG-27 deadlock (1213) ở lần chèn đầu cũng làm lại từ đầu', async () => {
    const realInsert = fx.accounts.insertPatient.bind(fx.accounts);
    vi.spyOn(fx.accounts, 'insertPatient')
      .mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('deadlock'), {
            errno: 1213,
            code: 'ER_LOCK_DEADLOCK',
          }),
        ),
      )
      .mockImplementation(realInsert);

    const result = await fx.service.register(registerBody());

    expect(result.maXacThucId).toBeDefined();
    expect(await allAccounts(db)).toHaveLength(1);
  });

  it('REG-28 HẾT 3 LẦN thì dừng: lỗi 500 (không phải AppException), log ERROR, không lặp vô hạn, không thư, băm một lần', async () => {
    await insertTaiKhoan(db, {
      email: 'dang.ky@example.com',
      daXacMinhEmail: false,
    });
    // mô phỏng người khác liên tục tạo/xoá: lần đọc nào cũng "chưa thấy", lần chèn nào cũng bị trùng (hàng thật có sẵn)
    const peek = vi.spyOn(fx.accounts, 'findByEmail').mockResolvedValue(null);
    const insert = vi.spyOn(fx.accounts, 'insertPatient');
    const hash = vi.spyOn(fx.hasher, 'hash');

    const error = await fx.service
      .register(registerBody())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toHaveProperty('maLoi'); // không phải AppException: bộ lọc P5 sẽ trả 500 LOI_HE_THONG
    expect(peek).toHaveBeenCalledTimes(3);
    expect(insert).toHaveBeenCalledTimes(3);
    expect(hash).toHaveBeenCalledTimes(1);
    expect(otpMailCount()).toBe(0);
    expect(logs.some((line) => /3 lần/.test(line))).toBe(true);
    expect(logs.join('\n')).not.toContain('dang.ky@example.com'); // log không chứa email
  });
});
