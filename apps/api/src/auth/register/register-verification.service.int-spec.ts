import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertBenhNhan } from '../entities/testing/auth-fixtures.js';
import type { VerifiedContext } from '../otp/otp.types.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  at,
  issueDeliverRead,
  issueOk,
  registerInput,
  rowOf,
  rowsOf,
  wrongCodeFor,
} from '../testing/otp-int-helpers.js';
import {
  REGISTER_PASSWORD,
  accountByEmail,
  allOtpRows,
  codeOfMail,
  registerBody,
} from '../testing/register-int-helpers.js';
import {
  createVerificationFixture,
  expectRefused,
  patientRows,
  registerPatient,
  resendBody,
  sessionCount,
  snapshotOf,
  verifyBody,
  walletRows,
  type Registered,
  type VerificationFixture,
} from '../testing/verification-int-helpers.js';

// Task A6 — POST /auth/register/verify-otp và /resend-otp ở mức dịch vụ, trên MySQL thật. Mã XM-nn (xác minh) và GL-nn (gửi lại) là [đề xuất];
// mỗi test ghi mã DK trong PLAN 7.1 mà nó phủ. Chạy đua và nhiều tài khoản: register-verification.concurrency / .multi-account; log: .logging.
const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;
const EMAIL = registerBody().email;

let db: DataSource;
let fx: VerificationFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createVerificationFixture(testDb);
});

const signUp = (overrides: Parameters<typeof registerBody>[0] = {}) =>
  registerPatient(db, fx, overrides);
const lastCode = (): string => codeOfMail(fx.mail, fx.mail.attempts.length - 1);
const logText = (): string => logs.join('\n');

async function accountOf(email = EMAIL): Promise<TaiKhoan> {
  const account = await accountByEmail(db, email);
  if (!account) throw new Error(`thiếu tài khoản ${email}`);
  return account;
}
const wrongAttemptsOf = async (id: string): Promise<number> =>
  (await rowOf(db, id)).soLanNhapSai;

/** Đăng ký lúc T0, gửi lại ở 23:55 (hạn mã mới 24:05) để còn một mã sống tới sau mốc 24 giờ của tài khoản. */
async function signUpNearExpiry(): Promise<Registered> {
  const first = await signUp();
  vi.setSystemTime(at(DAY - 300));
  const result = await fx.verification.resendOtp(resendBody(first));
  return { ...first, id: result.maXacThucId, code: lastCode() };
}

/** Mô phỏng A12 (đặt lại mật khẩu trên tài khoản chưa xác minh, N3): thu hồi mã đăng ký và xoá dữ liệu đăng ký. */
const voidRegistration = (taiKhoanId: string): Promise<number> =>
  fx.otp.transaction(async (manager) => {
    await fx.otp.revokePending(taiKhoanId, 'DangKy', { manager });
    return fx.otp.clearRegistrationData(taiKhoanId, { manager });
  });

describe('verify-otp — OTP đúng (DK-02, DK-42, DK-45)', () => {
  it('XM-20 (DK-02, DK-42, DK-45) ghi dữ liệu từ HÀNG OTP được xác minh (không phải tai_khoan cũ), đặt đã xác minh, đặt lại bộ đếm/khoá, tạo benh_nhan + ví 0/0, xoá băm khỏi mọi hàng', async () => {
    // Lần 1 mang dữ liệu A (tai_khoan giữ A, A5 không đổi tai_khoan khi đăng ký lại); lần 2 (T0+60s) mang dữ liệu B
    await signUp({
      hoTen: 'Tên Lần Một',
      soDienThoai: '0911111111',
      matKhau: 'Mat-Khau-Lan-1!',
    });
    vi.setSystemTime(at(60));
    const second = await signUp({
      hoTen: 'Tên Lần Hai',
      soDienThoai: '0922222222',
    });
    await db
      .getRepository(TaiKhoan)
      .update(
        { taiKhoanId: second.taiKhoanId },
        { soLanDangNhapSai: 4, khoaDangNhapDen: at(900) },
      );
    const before = await accountOf();
    expect(before).toMatchObject({
      hoTen: 'Tên Lần Một',
      soDienThoai: '0911111111',
      daXacMinhEmail: false,
    });
    vi.setSystemTime(at(100));
    const mailsBefore = fx.mail.attempts.length;

    await expect(
      fx.verification.verifyOtp(verifyBody(second)),
    ).resolves.toBeUndefined();

    const after = await accountOf();
    expect(after).toMatchObject({
      hoTen: 'Tên Lần Hai',
      soDienThoai: '0922222222',
      email: EMAIL,
      daXacMinhEmail: true,
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
      loaiTaiKhoan: 'BenhNhan',
      trangThai: 'DangHoatDong',
      ngaySinh: null,
      gioiTinh: null,
      diaChi: null,
      anhDaiDien: null,
    });
    expect(after.thoiDiemTao).toEqual(before.thoiDiemTao); // Q4: không gia hạn
    // DK-42: mật khẩu là của lần xác minh (V), không phải của lần chiếm trước (P)
    expect(
      await fx.hasher.verify(after.matKhauBam ?? '', REGISTER_PASSWORD),
    ).toBe(true);
    expect(
      await fx.hasher.verify(after.matKhauBam ?? '', 'Mat-Khau-Lan-1!'),
    ).toBe(false);

    expect(await patientRows(db)).toEqual([
      expect.objectContaining({
        taiKhoanId: after.taiKhoanId,
        khoaDatLichDoNoShow: false,
        soLanNoShow: 0,
      }),
    ]);
    expect(await walletRows(db)).toEqual([
      expect.objectContaining({
        benhNhanId: after.taiKhoanId,
        soDu: '0.00',
        soTienDangGiu: '0.00',
      }),
    ]);

    // DK-45: hàng vừa dùng mang đúng mốc của đồng hồ ứng dụng (không NOW() của DB); mọi hàng DangKy hết dữ liệu đăng ký
    const rows = await rowsOf(db, after.taiKhoanId);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.maXacThucId === second.id)).toMatchObject({
      daDungLuc: at(100),
      thuHoiLuc: null,
    });
    for (const row of rows) {
      expect(row).toMatchObject({
        hoTenDangKy: null,
        soDienThoaiDangKy: null,
        matKhauBamDangKy: null,
      });
    }
    expect(JSON.stringify(rows)).not.toContain('$argon2id$');
    // Đăng nhập là việc của A8: không phiên, không thư mới
    expect(await sessionCount(db)).toBe(0);
    expect(fx.mail.attempts).toHaveLength(mailsBefore);
  });

  it('XM-21 (DK-19) sai 4 lần rồi đúng → thành công như DK-02', async () => {
    const r = await signUp();
    for (let i = 1; i <= 4; i++) {
      await expectRefused(
        fx.verification.verifyOtp(verifyBody(r, { otp: wrongCodeFor(r.code) })),
        400,
        'OTP_SAI',
      );
    }
    expect(await wrongAttemptsOf(r.id)).toBe(4);

    await fx.verification.verifyOtp(verifyBody(r));

    expect((await accountOf()).daXacMinhEmail).toBe(true);
    expect(await patientRows(db)).toHaveLength(1);
    expect(await walletRows(db)).toHaveLength(1);
  });

  it('XM-22 (DK-18) sai 1 lần: báo sai, đếm 1, KHÔNG tạo gì; nhập lại đúng được', async () => {
    const r = await signUp();
    const before = await snapshotOf(db);

    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r, { otp: wrongCodeFor(r.code) })),
      400,
      'OTP_SAI',
    );

    const after = await snapshotOf(db);
    expect(after.accounts).toEqual(before.accounts);
    expect(after.patients).toEqual([]);
    expect(after.wallets).toEqual([]);
    expect(await wrongAttemptsOf(r.id)).toBe(1);
    await fx.verification.verifyOtp(verifyBody(r));
    expect((await accountOf()).daXacMinhEmail).toBe(true);
  });

  it('XM-23 (DK-20) sai đủ 5 lần: thu hồi ngay; mã ĐÚNG sau đó vẫn bị từ chối OTP_HET_LUOT; không tạo gì', async () => {
    const r = await signUp();
    const wrong = verifyBody(r, { otp: wrongCodeFor(r.code) });
    for (let i = 1; i <= 4; i++) {
      await expectRefused(fx.verification.verifyOtp(wrong), 400, 'OTP_SAI');
    }
    await expectRefused(fx.verification.verifyOtp(wrong), 400, 'OTP_HET_LUOT');
    expect((await rowOf(db, r.id)).thuHoiLuc).toEqual(at(0));

    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r)),
      400,
      'OTP_HET_LUOT',
    );

    expect((await accountOf()).daXacMinhEmail).toBe(false);
    expect(await patientRows(db)).toEqual([]);
    expect(await walletRows(db)).toEqual([]);
  });

  it.each([
    [599, true],
    [600, false],
    [601, false],
  ])(
    'XM-24 (DK-22) mã đúng ở giây %i (hạn 600, nửa mở) → %s',
    async (second, accepted) => {
      const r = await signUp();
      vi.setSystemTime(at(second));
      const verify = fx.verification.verifyOtp(verifyBody(r));
      if (accepted) await expect(verify).resolves.toBeUndefined();
      else await expectRefused(verify, 400, 'OTP_HET_HAN');
      expect((await accountOf()).daXacMinhEmail).toBe(accepted);
      expect(await patientRows(db)).toHaveLength(accepted ? 1 : 0);
    },
  );

  it('XM-25 (DK-23) mã SAI và quá hạn → OTP_HET_HAN, KHÔNG tăng so_lan_nhap_sai', async () => {
    const r = await signUp();
    vi.setSystemTime(at(601));

    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r, { otp: wrongCodeFor(r.code) })),
      400,
      'OTP_HET_HAN',
    );

    expect(await wrongAttemptsOf(r.id)).toBe(0);
  });

  it('XM-26 (DK-29) xác minh lại bằng CHÍNH mã đã dùng → OTP_SAI không đếm; vẫn đúng 1 benh_nhan, 1 ví, tài khoản không đổi', async () => {
    const r = await signUp();
    await fx.verification.verifyOtp(verifyBody(r));
    const before = await snapshotOf(db);

    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r)),
      400,
      'OTP_SAI',
    );

    expect(await snapshotOf(db)).toEqual(before);
    expect(before.patients).toHaveLength(1);
    expect(before.wallets).toHaveLength(1);
  });

  it('XM-27 mốc thời gian lấy từ MỘT đồng hồ (giả), không NOW() của DB: mã dùng và mã bị thu hồi đều mang đúng giây của đồng hồ giả', async () => {
    const r = await signUp();
    vi.setSystemTime(at(61));
    const inFlight = await issueOk(fx.otp, registerInput(r.taiKhoanId)); // đã cấp, chưa gửi: sẽ bị thu hồi khi xác minh
    vi.setSystemTime(at(250));

    await fx.verification.verifyOtp(verifyBody(r));

    expect((await rowOf(db, r.id)).daDungLuc).toEqual(at(250));
    expect((await rowOf(db, inFlight.maXacThucId)).thuHoiLuc).toEqual(at(250));
  });
});

describe('verify-otp — mã không dùng được (DK-31, DK-43, DK-44, DK-49, DK-50)', () => {
  it('XM-30 (DK-49) hàng chưa gửi thành công (gửi lỗi): ngay cả mã ĐÚNG trong thư lỗi cũng bị từ chối OTP_SAI, không đếm, không tạo gì', async () => {
    fx.mail.failNextWith('CONNECTION');
    await expectRefused(
      fx.service.register(registerBody()),
      503,
      'GUI_MAIL_LOI',
    );
    const [row] = await allOtpRows(db);
    const before = await snapshotOf(db);

    await expectRefused(
      fx.verification.verifyOtp({
        email: EMAIL,
        maXacThucId: row?.maXacThucId ?? 'thiếu',
        otp: codeOfMail(fx.mail, 0),
      }),
      400,
      'OTP_SAI',
    );

    expect(await snapshotOf(db)).toEqual(before);
  });

  it('XM-31 (DK-31) mã QuenMatKhau dùng cho đăng ký → OTP_SAI không đếm, tài khoản không đổi', async () => {
    const r = await signUp();
    const forgot = await issueDeliverRead(fx, await accountOf(), 'QuenMatKhau');
    const before = await snapshotOf(db);

    await expectRefused(
      fx.verification.verifyOtp({
        email: r.email,
        maXacThucId: forgot.id,
        otp: forgot.code,
      }),
      400,
      'OTP_SAI',
    );

    expect(await snapshotOf(db)).toEqual(before);
    expect((await rowOf(db, forgot.id)).soLanNhapSai).toBe(0);
  });

  it('XM-32 (DK-31) mã hoặc mã lần gửi của TÀI KHOẢN KHÁC: mã của B cho hàng của A bị đếm trên hàng A; hàng của B qua email của A không bị đếm và B vẫn xác minh được', async () => {
    const a = await signUp({ email: 'a.nguoi@example.com' });
    vi.setSystemTime(at(1));
    const b = await signUp({ email: 'b.nguoi@example.com' });
    const bCodeForA = b.code === a.code ? wrongCodeFor(a.code) : b.code;

    // (1) email A + id A + mã của B: sai mã thật sự ⇒ OTP_SAI và đếm trên hàng A
    await expectRefused(
      fx.verification.verifyOtp(verifyBody(a, { otp: bCodeForA })),
      400,
      'OTP_SAI',
    );
    expect(await wrongAttemptsOf(a.id)).toBe(1);
    // (2) email A + id của B + mã của B: sai cặp email–id ⇒ OTP_SAI, KHÔNG đếm trên hàng của B
    await expectRefused(
      fx.verification.verifyOtp(verifyBody(b, { email: a.email })),
      400,
      'OTP_SAI',
    );
    // (3) email B + id của A + mã của A: cũng không đếm
    await expectRefused(
      fx.verification.verifyOtp(verifyBody(a, { email: b.email })),
      400,
      'OTP_SAI',
    );
    expect(await wrongAttemptsOf(b.id)).toBe(0);
    expect(await wrongAttemptsOf(a.id)).toBe(1);
    expect((await accountOf(a.email)).daXacMinhEmail).toBe(false);

    await fx.verification.verifyOtp(verifyBody(b));
    expect((await accountOf(b.email)).daXacMinhEmail).toBe(true);
    expect((await accountOf(a.email)).daXacMinhEmail).toBe(false);
  });

  it('XM-33 email không có tài khoản, hoặc mã lần gửi không tồn tại → cùng một OTP_SAI, KHÔNG ghi gì (không lộ email đã đăng ký chưa)', async () => {
    const r = await signUp();
    const before = await snapshotOf(db);

    const unknownEmail = await expectRefused(
      fx.verification.verifyOtp(
        verifyBody(r, { email: 'la.hoan.toan@example.com' }),
      ),
      400,
      'OTP_SAI',
    );
    const unknownId = await expectRefused(
      fx.verification.verifyOtp(verifyBody(r, { maXacThucId: '999999' })),
      400,
      'OTP_SAI',
    );

    expect(unknownEmail.getResponse()).toEqual(unknownId.getResponse());
    expect(await snapshotOf(db)).toEqual(before);
  });

  it('XM-34 (DK-43, DK-44) mã lần gửi đã bị thay thế bởi hàng gửi thành công mới hơn → OTP_BI_THAY_THE kể cả với mã đúng của hàng cũ HOẶC mã của hàng mới; hàng mới vẫn xác minh được', async () => {
    const first = await signUp();
    vi.setSystemTime(at(60));
    const second = await signUp();

    await expectRefused(
      fx.verification.verifyOtp(verifyBody(first)),
      409,
      'OTP_BI_THAY_THE',
    );
    await expectRefused(
      fx.verification.verifyOtp(verifyBody(first, { otp: second.code })),
      409,
      'OTP_BI_THAY_THE',
    );
    expect((await accountOf()).daXacMinhEmail).toBe(false);

    await fx.verification.verifyOtp(verifyBody(second));
    expect((await accountOf()).daXacMinhEmail).toBe(true);
  });

  it('XM-35 (DK-50) sau khi đặt lại mật khẩu trên tài khoản chưa xác minh (dữ liệu đăng ký đã xoá): CAN_DANG_KY_LAI, tài khoản không đổi; đăng ký lại cùng email thì xác minh bình thường', async () => {
    const r = await signUp();
    await voidRegistration(r.taiKhoanId);
    const before = await snapshotOf(db);

    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r)),
      409,
      'CAN_DANG_KY_LAI',
    );

    expect(await snapshotOf(db)).toEqual(before);
    vi.setSystemTime(at(60));
    const again = await signUp();
    await fx.verification.verifyOtp(verifyBody(again));
    expect((await accountOf()).daXacMinhEmail).toBe(true);
  });

  it('XM-36 chỉ thu hồi mã DangKy còn lại, KHÔNG đụng mã QuenMatKhau; hàng DangKy đã cấp nhưng chưa gửi cũng bị thu hồi và xoá dữ liệu', async () => {
    const r = await signUp();
    const forgot = await issueDeliverRead(fx, await accountOf(), 'QuenMatKhau');
    vi.setSystemTime(at(61)); // cách hàng DangKy đầu đủ 60 giây
    const inFlight = await issueOk(fx.otp, registerInput(r.taiKhoanId));
    const forgotBefore = await rowOf(db, forgot.id);

    await fx.verification.verifyOtp(verifyBody(r));

    expect(await rowOf(db, forgot.id)).toEqual(forgotBefore); // nguyên vẹn: chưa dùng, chưa thu hồi
    expect((await rowOf(db, inFlight.maXacThucId)).thuHoiLuc).not.toBeNull();
    for (const row of await rowsOf(db, r.taiKhoanId)) {
      if (row.loai === 'DangKy') expect(row.matKhauBamDangKy).toBeNull();
    }
  });
});

describe('verify-otp — điều kiện tài khoản, chỉ kiểm khi mã ĐÚNG (24 giờ, ngưng hoạt động, dữ liệu hỏng)', () => {
  it('XM-40 biên 24 giờ: 23:59:59 xác minh được; đúng 24:00:00 và 24:00:01 → 409 CAN_DANG_KY_LAI, KHÔNG ghi gì, KHÔNG xoá gì (xoá là việc của A5 lười/A7)', async () => {
    const r = await signUpNearExpiry();
    const before = await snapshotOf(db);
    const mails = fx.mail.attempts.length;

    for (const second of [DAY, DAY + 1]) {
      vi.setSystemTime(at(second));
      await expectRefused(
        fx.verification.verifyOtp(verifyBody(r)),
        409,
        'CAN_DANG_KY_LAI',
      );
      expect(await snapshotOf(db)).toEqual(before); // mã vẫn chưa dùng: đã hoàn tác cả da_dung_luc
    }
    expect(fx.mail.attempts).toHaveLength(mails);

    vi.setSystemTime(at(DAY - 1));
    await fx.verification.verifyOtp(verifyBody(r));
    expect((await accountOf()).daXacMinhEmail).toBe(true);
  });

  it('XM-41 thứ tự ưu tiên: quá 24 giờ mà mã SAI → vẫn OTP_SAI và vẫn ĐẾM (24 giờ chỉ kiểm sau khi mã đúng); mã sai VÀ hết hạn → OTP_HET_HAN không đếm', async () => {
    const r = await signUpNearExpiry();
    vi.setSystemTime(at(DAY + 10));

    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r, { otp: wrongCodeFor(r.code) })),
      400,
      'OTP_SAI',
    );
    expect(await wrongAttemptsOf(r.id)).toBe(1);

    vi.setSystemTime(at(DAY + 301)); // sau hạn 10 phút của mã (24:05)
    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r, { otp: wrongCodeFor(r.code) })),
      400,
      'OTP_HET_HAN',
    );
    expect(await wrongAttemptsOf(r.id)).toBe(1);
  });

  it('XM-42 bị ngưng hoạt động: mã ĐÚNG → 403 TAI_KHOAN_NGUNG, hoàn tác trọn (mã chưa dùng), không tạo gì; mã SAI vẫn OTP_SAI và đếm', async () => {
    const r = await signUp();
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: r.taiKhoanId }, { trangThai: 'NgungHoatDong' });
    const before = await snapshotOf(db);

    const error = await expectRefused(
      fx.verification.verifyOtp(verifyBody(r)),
      403,
      'TAI_KHOAN_NGUNG',
    );

    expect(error.getResponse()).toMatchObject({
      thongBao:
        'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
    });
    expect(await snapshotOf(db)).toEqual(before);

    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r, { otp: wrongCodeFor(r.code) })),
      400,
      'OTP_SAI',
    );
    expect(await wrongAttemptsOf(r.id)).toBe(1);
  });

  it.each<[string, Partial<TaiKhoan>]>([
    ['đã xác minh email', { daXacMinhEmail: true }],
    ['là bác sĩ', { loaiTaiKhoan: 'BacSi' }],
    ['là quản trị viên', { loaiTaiKhoan: 'QuanTriVien' }],
    // Bệnh nhân ở trạng thái ChoKichHoat không dựng được: CHECK chk_tai_khoan_cho_kich_hoat_nhan_su của DB cấm (đã kiểm). Quy tắc thuần
    // vẫn xử lý nó an toàn, xem verification-rules.spec.ts XM-12.
  ])(
    'XM-43 (DK-30) hàng OTP còn sống nhưng tài khoản %s (dữ liệu hỏng): 409 CAN_DANG_KY_LAI + cảnh báo log (chỉ mã tài khoản), mật khẩu KHÔNG bị ghi đè, không tạo bản ghi thứ hai, mã chưa dùng',
    async (_label, corruption) => {
      const r = await signUp();
      await db
        .getRepository(TaiKhoan)
        .update({ taiKhoanId: r.taiKhoanId }, corruption);
      const before = await snapshotOf(db);

      await expectRefused(
        fx.verification.verifyOtp(verifyBody(r)),
        409,
        'CAN_DANG_KY_LAI',
      );

      expect(await snapshotOf(db)).toEqual(before);
      expect(logText()).toContain(
        `Tài khoản ${r.taiKhoanId} còn mã đăng ký sống nhưng không còn ở trạng thái chờ xác minh`,
      );
      expect(logText()).not.toContain(EMAIL);
    },
  );

  it('XM-44 hàng OTP đã khớp mã nhưng KHÔNG có dữ liệu đăng ký (registration = null): 409 CAN_DANG_KY_LAI + log chỉ mã tài khoản, tuyệt đối không ghi tai_khoan rỗng, hoàn tác cả việc đánh dấu đã dùng', async () => {
    const r = await signUp();
    const before = await snapshotOf(db);
    // OtpService đã chặn hàng NULL cả ba cột trước khi so mã, và CHECK của DB cấm NULL một phần, nên dựng nhánh này bằng cách cho
    // verify gọi onVerified với hàng không có dữ liệu, trong một giao dịch THẬT và sau khi đã đánh dấu đã dùng như verify thật.
    vi.spyOn(fx.otp, 'verify').mockImplementation((async (
      _input: unknown,
      _options: unknown,
      onVerified: (context: VerifiedContext) => Promise<unknown>,
    ) =>
      fx.otp.transaction(async (manager) => {
        await fx.repo.markUsed(manager, r.id, at(0));
        const otp = {
          maXacThucId: r.id,
          taiKhoanId: r.taiKhoanId,
          loai: 'DangKy' as const,
          hetHanLuc: at(600),
          registration: null,
        };
        const value = await onVerified({ manager, otp, now: at(0) });
        return { ok: true, otp, value };
      })) as never);

    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r)),
      409,
      'CAN_DANG_KY_LAI',
    );

    expect(await snapshotOf(db)).toEqual(before); // tai_khoan còn nguyên họ tên, SĐT, băm; mã chưa dùng
    expect(logText()).toContain(
      `Tài khoản ${r.taiKhoanId}: mã OTP đúng nhưng hàng mã thiếu dữ liệu đăng ký`,
    );
    expect(logText()).not.toContain(EMAIL);
  });
});

describe('verify-otp — một giao dịch, lỗi giữa chừng hoàn tác trọn (DK-03)', () => {
  it('XM-50 (DK-03) lỗi khi tạo vi_noi_bo (giả lập): ROLLBACK — chưa xác minh, không benh_nhan, OTP chưa dùng, tai_khoan không đổi; thử lại cùng mã thì thành công', async () => {
    const r = await signUp();
    const before = await snapshotOf(db);
    vi.spyOn(fx.wallets, 'insertEmpty').mockRejectedValueOnce(
      new Error('giả lập lỗi tạo ví'),
    );

    await expect(fx.verification.verifyOtp(verifyBody(r))).rejects.toThrow(
      'giả lập lỗi tạo ví',
    );

    expect(await snapshotOf(db)).toEqual(before);
    expect((await rowOf(db, r.id)).daDungLuc).toBeNull();
    await fx.verification.verifyOtp(verifyBody(r)); // mã còn dùng được
    expect(await walletRows(db)).toHaveLength(1);
  });

  it('XM-51 (DK-03) lỗi THẬT của MySQL: tài khoản chưa xác minh mà đã có benh_nhan (1062) → ROLLBACK trọn, lỗi 500 (Error thường, không AppException) có log ERROR chỉ mã tài khoản', async () => {
    const r = await signUp();
    await insertBenhNhan(db, r.taiKhoanId);
    const before = await snapshotOf(db);

    const thrown = await fx.verification
      .verifyOtp(verifyBody(r))
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      `Hồ sơ bệnh nhân hoặc ví nội bộ của tài khoản ${r.taiKhoanId} đã tồn tại trước khi xác minh`,
    );
    expect((thrown as { cause?: unknown }).cause).toBeUndefined();
    expect(await snapshotOf(db)).toEqual(before);
    expect(logText()).toContain(
      `Tài khoản ${r.taiKhoanId} chưa xác minh nhưng đã có hồ sơ bệnh nhân hoặc ví nội bộ`,
    );
    expect(logText()).not.toContain(EMAIL);
  });

  it('XM-52 UPDATE tai_khoan không trúng đúng 1 hàng (điều kiện bảo vệ) → lỗi, ROLLBACK trọn, không benh_nhan/ví', async () => {
    const r = await signUp();
    const before = await snapshotOf(db);
    vi.spyOn(fx.accounts, 'activateRegistration').mockResolvedValueOnce(false);

    await expect(fx.verification.verifyOtp(verifyBody(r))).rejects.toThrow(
      `Không kích hoạt được tài khoản ${r.taiKhoanId}`,
    );

    expect(await snapshotOf(db)).toEqual(before);
  });

  it('XM-53 lỗi ở bước thu hồi/xoá dữ liệu cuối giao dịch → ROLLBACK cả benh_nhan, ví, tai_khoan đã ghi trước đó', async () => {
    const r = await signUp();
    const before = await snapshotOf(db);
    vi.spyOn(fx.otp, 'clearRegistrationData').mockRejectedValueOnce(
      new Error('giả lập lỗi xoá dữ liệu đăng ký'),
    );

    await expect(fx.verification.verifyOtp(verifyBody(r))).rejects.toThrow(
      'giả lập lỗi xoá dữ liệu đăng ký',
    );

    expect(await snapshotOf(db)).toEqual(before);
  });
});

describe('resend-otp (DK-21, DK-24, DK-28, DK-38, DK-44, DK-48, DK-50)', () => {
  it('GL-01 (DK-21) sau khi hết lượt nhập: gửi lại bằng mã lần gửi cũ → hàng MỚI sao chép dữ liệu đăng ký, đếm sai = 0, mã mới xác minh được; kết quả cùng dạng với đăng ký, không có OTP', async () => {
    const r = await signUp();
    const wrong = verifyBody(r, { otp: wrongCodeFor(r.code) });
    for (let i = 1; i <= 5; i++) {
      await fx.verification.verifyOtp(wrong).catch(() => undefined);
    }
    expect((await rowOf(db, r.id)).thuHoiLuc).not.toBeNull();
    vi.setSystemTime(at(60));

    const result = await fx.verification.resendOtp(resendBody(r));

    expect(Object.keys(result).sort()).toEqual([
      'coTheGuiLaiLuc',
      'hetHanLuc',
      'maXacThucId',
    ]);
    expect(result.maXacThucId).not.toBe(r.id);
    expect(result.hetHanLuc).toEqual(at(660));
    expect(result.coTheGuiLaiLuc).toEqual(at(120));
    expect(JSON.stringify(result)).not.toContain(lastCode());
    const [old, fresh] = [
      await rowOf(db, r.id),
      await rowOf(db, result.maXacThucId),
    ];
    expect(fresh).toMatchObject({
      hoTenDangKy: old.hoTenDangKy,
      soDienThoaiDangKy: old.soDienThoaiDangKy,
      matKhauBamDangKy: old.matKhauBamDangKy,
      soLanNhapSai: 0,
      daGuiLuc: at(60),
      thuHoiLuc: null,
    });
    // tới đúng email đã lưu trong tài khoản
    expect(fx.mail.sent.at(-1)?.to).toBe(EMAIL);
    // mã cũ giờ bị hàng gửi thành công mới hơn thay thế (kiểm trước đó: hết lượt, XM-23)
    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r)),
      409,
      'OTP_BI_THAY_THE',
    );

    await fx.verification.verifyOtp(
      verifyBody({ ...r, id: result.maXacThucId, code: lastCode() }),
    );
    expect((await accountOf()).daXacMinhEmail).toBe(true);
  });

  it('GL-02 (DK-24) mã hết hạn → gửi lại → mã mới xác minh được', async () => {
    const r = await signUp();
    vi.setSystemTime(at(601));
    await expectRefused(
      fx.verification.verifyOtp(verifyBody(r)),
      400,
      'OTP_HET_HAN',
    );

    const result = await fx.verification.resendOtp(resendBody(r));

    await fx.verification.verifyOtp(
      verifyBody({ ...r, id: result.maXacThucId, code: lastCode() }),
    );
    expect((await accountOf()).daXacMinhEmail).toBe(true);
  });

  it('GL-03 (DK-28) gửi lại luôn tính vào giới hạn: 30 giây sau → 429 GUI_LAI_QUA_SOM kèm soGiayCho, không hàng mới, không thư; mã thứ 6 trong 1 giờ cũng 429', async () => {
    const r = await signUp();
    vi.setSystemTime(at(30));
    const tooSoon = await expectRefused(
      fx.verification.resendOtp(resendBody(r)),
      429,
      'GUI_LAI_QUA_SOM',
    );
    expect(tooSoon.getResponse()).toMatchObject({ chiTiet: { soGiayCho: 30 } });
    expect(await allOtpRows(db)).toHaveLength(1);
    expect(fx.mail.attempts).toHaveLength(1);

    let current = r;
    for (const second of [60, 120, 180, 240]) {
      vi.setSystemTime(at(second));
      const result = await fx.verification.resendOtp(resendBody(current));
      current = { ...current, id: result.maXacThucId }; // mỗi lần gửi lại cho một mã lần gửi MỚI; mã cũ bị thay thế
    }
    expect(await allOtpRows(db)).toHaveLength(5);
    vi.setSystemTime(at(300));
    const hourly = await expectRefused(
      fx.verification.resendOtp(resendBody(current)),
      429,
      'GUI_LAI_QUA_SOM',
    );
    expect(
      (hourly.getResponse() as { chiTiet: { soGiayCho: number } }).chiTiet
        .soGiayCho,
    ).toBeGreaterThan(60);
    expect(await allOtpRows(db)).toHaveLength(5);
  });

  it('GL-04 (DK-44) mã lần gửi đã bị thay thế bởi hàng gửi thành công mới hơn → 409 OTP_BI_THAY_THE, không hàng mới, không thư', async () => {
    const first = await signUp();
    vi.setSystemTime(at(60));
    await signUp();
    vi.setSystemTime(at(200));
    const before = await snapshotOf(db);
    const mails = fx.mail.attempts.length;

    await expectRefused(
      fx.verification.resendOtp(resendBody(first)),
      409,
      'OTP_BI_THAY_THE',
    );

    expect(await snapshotOf(db)).toEqual(before);
    expect(fx.mail.attempts).toHaveLength(mails);
  });

  it('GL-05 (DK-48) hàng mới nhất gửi lỗi: gửi lại bằng chính mã lần gửi đó được phép; thành công thì thu hồi hàng cũ; hàng mới sao chép dữ liệu', async () => {
    const r = await signUp();
    vi.setSystemTime(at(60));
    fx.mail.failNextWith('CONNECTION');
    const failed = await expectRefused(
      fx.verification.resendOtp(resendBody(r)),
      503,
      'GUI_MAIL_LOI',
    );
    const failedId = (
      failed.getResponse() as { chiTiet: { maXacThucId: string } }
    ).chiTiet.maXacThucId;
    expect(failed.getResponse()).toMatchObject({
      chiTiet: { maXacThucId: failedId, coTheGuiLaiLuc: at(120).toISOString() },
    });
    expect(await rowOf(db, failedId)).toMatchObject({ daGuiLuc: null });
    expect((await rowOf(db, failedId)).thuHoiLuc).not.toBeNull();
    expect((await rowOf(db, r.id)).thuHoiLuc).toBeNull(); // DK-26: hàng cũ còn dùng được

    vi.setSystemTime(at(120));
    const result = await fx.verification.resendOtp({
      email: r.email,
      maXacThucId: failedId,
    });

    expect((await rowOf(db, r.id)).thuHoiLuc).toEqual(at(120)); // thành công thì thu hồi hàng cũ
    const fresh = await rowOf(db, result.maXacThucId);
    expect(fresh.hoTenDangKy).toBe('Nguyễn Văn A');
    expect(fresh.matKhauBamDangKy).not.toBeNull();
    await fx.verification.verifyOtp(
      verifyBody({ ...r, id: result.maXacThucId, code: lastCode() }),
    );
  });

  it('GL-06 (DK-26, DK-48) gửi lại lỗi: 503 GUI_MAIL_LOI không lộ loại lỗi SMTP; mã CŨ còn hạn vẫn xác minh được; hàng lỗi vẫn tính giới hạn 60 giây', async () => {
    const r = await signUp();
    vi.setSystemTime(at(60));
    fx.mail.failNextWith('AUTH');
    const failed = await expectRefused(
      fx.verification.resendOtp(resendBody(r)),
      503,
      'GUI_MAIL_LOI',
    );
    expect(JSON.stringify(failed.getResponse())).not.toMatch(/auth|smtp/i);

    vi.setSystemTime(at(90));
    await expectRefused(
      fx.verification.resendOtp(resendBody(r)),
      429,
      'GUI_LAI_QUA_SOM',
    ); // hàng lỗi (tạo lúc 60) vẫn tính: 30 giây nữa
    await fx.verification.verifyOtp(verifyBody(r));
    expect((await accountOf()).daXacMinhEmail).toBe(true);
  });

  it('GL-07 (DK-50, DK-31) mã lần gửi không dùng được → từ chối, không hàng mới, không thư: dữ liệu đăng ký đã xoá → CAN_DANG_KY_LAI; mã QuenMatKhau, mã của tài khoản khác, email lạ → OTP_SAI', async () => {
    const a = await signUp({ email: 'a.nguoi@example.com' });
    const b = await signUp({ email: 'b.nguoi@example.com' });
    const forgot = await issueDeliverRead(
      fx,
      await accountOf(a.email),
      'QuenMatKhau',
    );
    vi.setSystemTime(at(100));
    const before = await snapshotOf(db);
    const mails = fx.mail.attempts.length;

    await expectRefused(
      fx.verification.resendOtp({ email: a.email, maXacThucId: forgot.id }),
      400,
      'OTP_SAI',
    );
    await expectRefused(
      fx.verification.resendOtp(resendBody(b, { email: a.email })),
      400,
      'OTP_SAI',
    );
    await expectRefused(
      fx.verification.resendOtp(resendBody(a, { email: 'la@example.com' })),
      400,
      'OTP_SAI',
    );
    expect(await snapshotOf(db)).toEqual(before);

    await voidRegistration(a.taiKhoanId);
    const afterVoid = await snapshotOf(db);
    await expectRefused(
      fx.verification.resendOtp(resendBody(a)),
      409,
      'CAN_DANG_KY_LAI',
    );

    expect(await snapshotOf(db)).toEqual(afterVoid);
    expect(fx.mail.attempts).toHaveLength(mails);
  });

  it('GL-08 sau khi đã xác minh, gửi lại bằng mã đã dùng → OTP_SAI, không hàng mới', async () => {
    const r = await signUp();
    await fx.verification.verifyOtp(verifyBody(r));
    vi.setSystemTime(at(200));
    const before = await snapshotOf(db);

    await expectRefused(
      fx.verification.resendOtp(resendBody(r)),
      400,
      'OTP_SAI',
    );

    expect(await snapshotOf(db)).toEqual(before);
  });

  it.each([
    [DAY - 1, true],
    [DAY, false],
    [DAY + 1, false],
  ])(
    'GL-09 (DK-38) gửi lại ở giây %i sau khi đăng ký (hạn 24 giờ, nửa mở) → còn gửi được: %s; từ chối thì 409 CAN_DANG_KY_LAI, hoàn tác cả hàng vừa chèn, không thư; gửi lại không kéo dài hạn',
    async (second, allowed) => {
      const r = await signUp();
      const born = (await accountOf()).thoiDiemTao;
      vi.setSystemTime(at(DAY - 3600));
      const hourBefore = await fx.verification.resendOtp(resendBody(r));
      expect((await accountOf()).thoiDiemTao).toEqual(born); // gửi lại KHÔNG kéo dài hạn 24 giờ
      const current = { ...r, id: hourBefore.maXacThucId };
      const before = await snapshotOf(db);
      const mails = fx.mail.attempts.length;

      vi.setSystemTime(at(second)); // đã quá 60 giây sau hàng cuối: OtpService cho qua, tới lượt kiểm 24 giờ
      const resend = fx.verification.resendOtp(resendBody(current));

      if (allowed) {
        await expect(resend).resolves.toMatchObject({
          hetHanLuc: at(second + 600),
        });
        expect((await accountOf()).thoiDiemTao).toEqual(born);
      } else {
        await expectRefused(resend, 409, 'CAN_DANG_KY_LAI');
        expect(await snapshotOf(db)).toEqual(before);
        expect(fx.mail.attempts).toHaveLength(mails);
      }
    },
  );

  it('GL-10 thứ tự ưu tiên khi quá 24 giờ: OtpService từ chối TRƯỚC (hàng bị thay thế → 409 OTP_BI_THAY_THE; chưa đủ 60 giây → 429), 24 giờ chỉ kiểm sau cùng', async () => {
    const first = await signUp();
    vi.setSystemTime(at(DAY - 30));
    const second = await fx.verification.resendOtp(resendBody(first)); // hàng cuối tạo lúc 23:59:30

    vi.setSystemTime(at(DAY)); // quá 24 giờ, mới 30 giây sau hàng cuối
    const tooSoon = await expectRefused(
      fx.verification.resendOtp({
        email: first.email,
        maXacThucId: second.maXacThucId,
      }),
      429,
      'GUI_LAI_QUA_SOM',
    );
    expect(tooSoon.getResponse()).toMatchObject({ chiTiet: { soGiayCho: 30 } });
    await expectRefused(
      fx.verification.resendOtp(resendBody(first)),
      409,
      'OTP_BI_THAY_THE',
    );
  });

  it('GL-11 bị ngưng hoạt động: 403 TAI_KHOAN_NGUNG, hoàn tác hàng vừa chèn, không thư; nhưng chưa đủ 60 giây thì OtpService từ chối trước (429)', async () => {
    const r = await signUp();
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: r.taiKhoanId }, { trangThai: 'NgungHoatDong' });
    const before = await snapshotOf(db);
    const mails = fx.mail.attempts.length;

    vi.setSystemTime(at(30));
    await expectRefused(
      fx.verification.resendOtp(resendBody(r)),
      429,
      'GUI_LAI_QUA_SOM',
    );
    vi.setSystemTime(at(61));
    await expectRefused(
      fx.verification.resendOtp(resendBody(r)),
      403,
      'TAI_KHOAN_NGUNG',
    );

    expect(await snapshotOf(db)).toEqual(before);
    expect(fx.mail.attempts).toHaveLength(mails);
  });

  it.each<[string, Partial<TaiKhoan>]>([
    ['đã xác minh email', { daXacMinhEmail: true }],
    ['là lễ tân', { loaiTaiKhoan: 'LeTan' }],
  ])(
    'GL-12 (DK-30) hàng OTP còn sống nhưng tài khoản %s (dữ liệu hỏng) → 409 CAN_DANG_KY_LAI + cảnh báo log, hoàn tác hàng vừa chèn, không thư',
    async (_label, corruption) => {
      const r = await signUp();
      await db
        .getRepository(TaiKhoan)
        .update({ taiKhoanId: r.taiKhoanId }, corruption);
      vi.setSystemTime(at(61));
      const before = await snapshotOf(db);
      const mails = fx.mail.attempts.length;

      await expectRefused(
        fx.verification.resendOtp(resendBody(r)),
        409,
        'CAN_DANG_KY_LAI',
      );

      expect(await snapshotOf(db)).toEqual(before);
      expect(fx.mail.attempts).toHaveLength(mails);
      expect(logText()).toContain(
        `Tài khoản ${r.taiKhoanId} còn mã đăng ký sống`,
      );
    },
  );

  it('GL-13 lời chào trong thư dùng họ tên của HÀNG mới (lần đăng ký gần nhất), không phải tên cũ trong tai_khoan; thư tới email đã lưu dù gõ khác hoa/thường tên miền', async () => {
    await signUp({ hoTen: 'Tên Cũ Trong Tài Khoản' });
    vi.setSystemTime(at(60));
    const second = await signUp({ hoTen: 'Tên Mới Của Lần Hai' });
    vi.setSystemTime(at(120));

    await fx.verification.resendOtp({
      email: 'DANG.KY@EXAMPLE.COM',
      maXacThucId: second.id,
    });

    const mail = fx.mail.sent.at(-1);
    expect(mail?.to).toBe(EMAIL);
    expect(mail?.text).toContain('Tên Mới Của Lần Hai');
    expect(mail?.text).not.toContain('Tên Cũ Trong Tài Khoản');
  });
});
