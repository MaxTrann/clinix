import type { AppException } from '../../common/errors/app.exception.js';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { LOGIN_LOCK_MS, UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { sha256Hex } from '../session/token.service.js';
import { captureLogsByLevel } from '../testing/log-levels.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  LOGIN_PASSWORD,
  WRONG_PASSWORD,
  createLoginFixture,
  failureState,
  loginBody,
  newLoginAccount,
  sessionRowsOf,
  setFailureState,
  type LoginFixture,
} from '../testing/login-int-helpers.js';
import {
  at,
  forgotInput,
  issueOk,
  wrongCodeFor,
} from '../testing/otp-int-helpers.js';
import { readOtpFromMail } from '../testing/otp-test-helpers.js';
import {
  REGISTER_PASSWORD,
  accountByEmail,
  appExceptionOf,
} from '../testing/register-int-helpers.js';
import {
  deferred,
  expectRefused,
  registerPatient,
  resendBody,
  sessionCount,
  sleep,
  snapshotOf,
  verifyBody,
} from '../testing/verification-int-helpers.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';

// Task A8 — POST /auth/login ở mức dịch vụ trên MySQL 8.4 thật, đồng hồ giả (chỉ giả Date), MailService giả.
// Mã test case: DN-01, DN-02, DN-04, DN-05, DN-06, DN-07, DN-08, DN-09, DN-10, DN-11, DN-13, DN-14, DN-15, DN-16, DN-17, DN-18, DN-19, DN-21 (mức
// OtpService; phần HTTP làm ở A11), DN-37, DN-38, TECH_DEBT 32; quyết định A8-C (hết khoá thì đếm lại), A8-E (kiểm lại dưới khoá).
// Mã LG-nn là [đề xuất]. HTTP thật: test/auth-login.e2e-spec.ts. Đua nhiều tài khoản: login.multi-account.int-spec.ts.
const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;
const LOCK = LOGIN_LOCK_MS / 1000;

let db: DataSource;
let fx: LoginFixture<FakeMailService>;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = createLoginFixture(testDb);
});

const bodyOf = (error: AppException) =>
  error.getResponse() as {
    maLoi: string;
    thongBao: string;
    chiTiet?: Record<string, unknown>;
  };

/** Đăng nhập sai `times` lần liên tiếp (mỗi lần bị từ chối; nuốt lỗi) */
async function failTimes(email: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await appExceptionOf(fx.login.login({ email, matKhau: WRONG_PASSWORD }));
  }
}

describe('đăng nhập thành công', () => {
  it('LG-01 (DN-01) Bệnh nhân đã xác minh, đúng mật khẩu: một phiên (hạn +30 phút, chỉ lưu băm SHA-256 của refresh), access token dùng được, bộ đếm 0', async () => {
    const account = await newLoginAccount(db);

    const { vaiTro, session } = await fx.login.login(loginBody(account));

    expect(vaiTro).toBe('BenhNhan');
    const rows = await sessionRowsOf(db, account.taiKhoanId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.taoLuc).toEqual(at(0));
    expect(rows[0]?.hetHanLuc).toEqual(at(30 * 60));
    expect(rows[0]?.thuHoiLuc).toBeNull();
    expect(rows[0]?.refreshTokenBam).toBe(sha256Hex(session.refreshToken));
    expect(rows[0]?.refreshTokenBam).not.toBe(session.refreshToken);
    expect(session.refreshTokenExpiresAt).toEqual(at(30 * 60));
    expect(await fx.tokens.verifyAccessToken(session.accessToken)).toEqual({
      accountId: account.taiKhoanId,
      sessionId: String(rows[0]?.phienDangNhapId),
    });
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
  });

  it.each(['BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien'] as const)(
    'LG-02 (DN-02) vai trò %s: trả đúng vai trò và guard của A4 (resolveActive) nhận phiên mới',
    async (loaiTaiKhoan) => {
      const account = await newLoginAccount(db, { loaiTaiKhoan });

      const { vaiTro, session } = await fx.login.login(loginBody(account));

      expect(vaiTro).toBe(loaiTaiKhoan);
      expect(
        await fx.sessionService.resolveActive({
          accountId: account.taiKhoanId,
          sessionId: session.sessionId,
        }),
      ).toEqual({
        accountId: account.taiKhoanId,
        sessionId: session.sessionId,
        role: loaiTaiKhoan,
      });
    },
  );

  it('LG-03 (DN-04) email khác hoa/thường ở phần trước @: vào được đúng tài khoản đó (DB so không phân biệt hoa/thường), không tạo tài khoản mới', async () => {
    const account = await newLoginAccount(db, {
      email: 'nguyen.van@example.com',
    });

    await fx.login.login({
      email: 'NGUYEN.Van@example.com',
      matKhau: LOGIN_PASSWORD,
    });

    expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(1);
    expect(await db.getRepository(TaiKhoan).count()).toBe(1);
  });

  it('LG-04 tài khoản đã có phiên cũ: phiên mới được tạo, phiên cũ KHÔNG bị thu hồi (đa thiết bị, A8-F)', async () => {
    const account = await newLoginAccount(db);
    const first = await fx.login.login(loginBody(account));
    vi.setSystemTime(at(60));

    const second = await fx.login.login(loginBody(account));

    const rows = await sessionRowsOf(db, account.taiKhoanId);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.thuHoiLuc)).toEqual([null, null]);
    expect(first.session.refreshToken).not.toBe(second.session.refreshToken);
    expect(rows[0]?.refreshTokenBam).not.toBe(rows[1]?.refreshTokenBam);
  });
});

describe('email lạ, mật khẩu sai, đếm và khoá', () => {
  it('LG-10 (DN-05, DN-06) email không tồn tại: 401 DANG_NHAP_SAI; so GIẢ đúng một lần và KHÔNG so thật; không ghi gì, không đếm', async () => {
    const verify = vi.spyOn(fx.hasher, 'verify');
    const dummy = vi.spyOn(fx.hasher, 'verifyDummy');
    await newLoginAccount(db);
    const before = await snapshotOf(db);

    await expectRefused(
      fx.login.login({
        email: 'khong.co@example.com',
        matKhau: WRONG_PASSWORD,
      }),
      401,
      'DANG_NHAP_SAI',
    );

    expect(dummy).toHaveBeenCalledTimes(1);
    expect(dummy).toHaveBeenCalledWith(WRONG_PASSWORD);
    expect(verify).not.toHaveBeenCalled();
    expect(await snapshotOf(db)).toEqual(before);
  });

  it('LG-11 (DN-07) sai lần 1 đến 4: DANG_NHAP_SAI, thân GIỐNG HỆT nhau và giống email lạ (không "còn N lần", G1); mỗi lần bộ đếm tăng 1 và đã COMMIT dù đã trả lỗi; chưa khoá', async () => {
    const account = await newLoginAccount(db);
    const unknown = await appExceptionOf(
      fx.login.login({
        email: 'khong.co@example.com',
        matKhau: WRONG_PASSWORD,
      }),
    );

    for (let attempt = 1; attempt <= 4; attempt++) {
      const error = await expectRefused(
        fx.login.login(loginBody(account, WRONG_PASSWORD)),
        401,
        'DANG_NHAP_SAI',
      );
      expect(error.getResponse()).toEqual(unknown.getResponse());
      expect(await failureState(db, account.taiKhoanId)).toEqual({
        soLanDangNhapSai: attempt,
        khoaDangNhapDen: null,
      });
    }
    expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(0);
  });

  it('LG-12 (DN-08) sai lần thứ 5 liên tiếp: 429 BI_KHOA_TAM với 900 giây còn lại; khoa_dang_nhap_den = bây giờ + 15 phút', async () => {
    const account = await newLoginAccount(db);
    await failTimes(account.email, 4);

    const error = await expectRefused(
      fx.login.login(loginBody(account, WRONG_PASSWORD)),
      429,
      'TAI_KHOAN_BI_KHOA_TAM',
    );

    expect(bodyOf(error).chiTiet).toEqual({
      soGiayConLai: LOCK,
      khoaDen: at(LOCK).toISOString(),
    });
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
  });

  it('LG-13 (DN-09) đang khoá, nhập ĐÚNG mật khẩu: vẫn 429, KHÔNG so mật khẩu, không đếm, không phiên; số giây còn lại giảm theo đồng hồ', async () => {
    const account = await newLoginAccount(db);
    await setFailureState(db, account.taiKhoanId, {
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
    const verify = vi.spyOn(fx.hasher, 'verify');
    const dummy = vi.spyOn(fx.hasher, 'verifyDummy');
    vi.setSystemTime(at(100));

    const error = await expectRefused(
      fx.login.login(loginBody(account)),
      429,
      'TAI_KHOAN_BI_KHOA_TAM',
    );

    expect(bodyOf(error).chiTiet?.['soGiayConLai']).toBe(LOCK - 100);
    expect(verify).not.toHaveBeenCalled();
    expect(dummy).not.toHaveBeenCalled();
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
    expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(0);
  });

  it('LG-14 (DN-10) đang khoá sau lần sai thứ 5: 14:59 vẫn bị từ chối (còn 1 giây), ĐÚNG 15:00:00 và 15:01 vào được, bộ đếm về 0 và khoá được xoá', async () => {
    const account = await newLoginAccount(db);
    await failTimes(account.email, 5);

    vi.setSystemTime(at(LOCK - 1));
    const error = await expectRefused(
      fx.login.login(loginBody(account)),
      429,
      'TAI_KHOAN_BI_KHOA_TAM',
    );
    expect(bodyOf(error).chiTiet?.['soGiayConLai']).toBe(1);

    vi.setSystemTime(at(LOCK));
    await fx.login.login(loginBody(account));
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
    expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(1);

    vi.setSystemTime(at(LOCK + 61)); // 15:01 sau lần khoá: vẫn vào được
    await fx.login.login(loginBody(account));
    expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(2);
  });

  it('LG-15 (DN-11) sai 3, đúng 1, sai 4: không khoá; lần sai thứ 5 SAU lần đúng mới khoá (bộ đếm đã về 0 ở lần đúng)', async () => {
    const account = await newLoginAccount(db);
    await failTimes(account.email, 3);
    await fx.login.login(loginBody(account));
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });

    await failTimes(account.email, 4);
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 4,
      khoaDangNhapDen: null,
    });
    await expectRefused(
      fx.login.login(loginBody(account, WRONG_PASSWORD)),
      429,
      'TAI_KHOAN_BI_KHOA_TAM',
    );
  });

  it('LG-16 (DN-13, A8-C) sai tiếp SAU khi hết khoá: đếm lại từ 1 (401, không khoá lại ngay), khoá cũ bị xoá; cần đủ 5 lần mới khoá lần nữa', async () => {
    const account = await newLoginAccount(db);
    await failTimes(account.email, 5); // khoá đến at(LOCK)
    vi.setSystemTime(at(LOCK + 1));

    await expectRefused(
      fx.login.login(loginBody(account, WRONG_PASSWORD)),
      401,
      'DANG_NHAP_SAI',
    );
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 1,
      khoaDangNhapDen: null,
    });

    await failTimes(account.email, 3);
    await expectRefused(
      fx.login.login(loginBody(account, WRONG_PASSWORD)),
      429,
      'TAI_KHOAN_BI_KHOA_TAM',
    );
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK + 1 + LOCK),
    });
  });

  it('LG-17 (DN-01) đăng nhập đúng khi khoá cũ đã hết hạn: bộ đếm về 0 VÀ cột khoá về NULL', async () => {
    const account = await newLoginAccount(db);
    await setFailureState(db, account.taiKhoanId, {
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
    vi.setSystemTime(at(LOCK + 1));

    await fx.login.login(loginBody(account));

    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
  });

  it.each([
    ['có chữ có dấu', 'Mậtkhẩu-Sai-9!'],
    ['có emoji', 'Mat-Khau-Sai-9!😀'],
    ['yếu (không đạt chính sách đặt mật khẩu)', 'abc'],
  ])(
    'LG-18 (A8-B) mật khẩu %s: đi hết luồng như mật khẩu sai, được ĐẾM (không bị chặn riêng ở biên)',
    async (_ten, matKhau) => {
      const account = await newLoginAccount(db);

      await expectRefused(
        fx.login.login({ email: account.email, matKhau }),
        401,
        'DANG_NHAP_SAI',
      );

      expect(
        (await failureState(db, account.taiKhoanId)).soLanDangNhapSai,
      ).toBe(1);
    },
  );

  it('LG-19 (DN-06) kiểm thô thời gian: trung vị đường email lạ >= 50% trung vị đường sai mật khẩu (bỏ so giả thì chỉ còn khoảng 10%)', async () => {
    const account = await newLoginAccount(db);
    const unknownRun = () =>
      appExceptionOf(
        fx.login.login({
          email: 'khong.co@example.com',
          matKhau: WRONG_PASSWORD,
        }),
      );
    const wrongRun = async () => {
      await setFailureState(db, account.taiKhoanId, {
        soLanDangNhapSai: 0,
        khoaDangNhapDen: null,
      });
      const started = performance.now();
      await appExceptionOf(fx.login.login(loginBody(account, WRONG_PASSWORD)));
      return performance.now() - started;
    };
    const timed = async (run: () => Promise<unknown>) => {
      const started = performance.now();
      await run();
      return performance.now() - started;
    };
    for (let i = 0; i < 3; i++) {
      await unknownRun();
      await wrongRun();
    }
    const unknownTimes: number[] = [];
    const wrongTimes: number[] = [];
    for (let i = 0; i < 15; i++) {
      unknownTimes.push(await timed(unknownRun));
      wrongTimes.push(await wrongRun());
    }
    const median = (values: number[]) =>
      [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

    console.info(
      `[LG-19] trung vị email lạ ${median(unknownTimes).toFixed(1)} ms, sai mật khẩu ${median(wrongTimes).toFixed(1)} ms`,
    );
    expect(median(unknownTimes)).toBeGreaterThanOrEqual(
      median(wrongTimes) * 0.5,
    );
  });

  it('LG-20 băm chạy NGOÀI giao dịch: hasher.verify được gọi TRƯỚC khi mở giao dịch (không giữ khoá hàng hay kết nối DB trong lúc băm)', async () => {
    const account = await newLoginAccount(db);
    const verify = vi.spyOn(fx.hasher, 'verify');
    const transaction = vi.spyOn(db, 'transaction');

    await fx.login.login(loginBody(account));

    expect(verify).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[0]).toBe('READ COMMITTED');
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

describe('trạng thái tài khoản (kiểm TRƯỚC khi so mật khẩu)', () => {
  it.each([
    ['đúng', LOGIN_PASSWORD],
    ['sai', WRONG_PASSWORD],
  ])(
    'LG-30 (DN-14) NgungHoatDong, mật khẩu %s: 403 TAI_KHOAN_NGUNG, KHÔNG so mật khẩu (kể cả so giả), bộ đếm không đổi, không phiên',
    async (_ten, matKhau) => {
      const account = await newLoginAccount(db, {
        trangThai: 'NgungHoatDong',
        soLanDangNhapSai: 2,
      });
      const verify = vi.spyOn(fx.hasher, 'verify');
      const dummy = vi.spyOn(fx.hasher, 'verifyDummy');

      await expectRefused(
        fx.login.login({ email: account.email, matKhau }),
        403,
        'TAI_KHOAN_NGUNG',
      );

      expect(verify).not.toHaveBeenCalled();
      expect(dummy).not.toHaveBeenCalled();
      expect(
        (await failureState(db, account.taiKhoanId)).soLanDangNhapSai,
      ).toBe(2);
      expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(0);
    },
  );

  it('LG-31 (DN-15) nhân sự ChoKichHoat (mat_khau_bam NULL): 403 TAI_KHOAN_CHUA_KICH_HOAT, không so mật khẩu, không lỗi null, bộ đếm không đổi', async () => {
    const account = await newLoginAccount(db, {
      loaiTaiKhoan: 'BacSi',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
      daXacMinhEmail: false,
    });
    const verify = vi.spyOn(fx.hasher, 'verify');
    const dummy = vi.spyOn(fx.hasher, 'verifyDummy');

    await expectRefused(
      fx.login.login(loginBody(account)),
      403,
      'TAI_KHOAN_CHUA_KICH_HOAT',
    );

    expect(verify).not.toHaveBeenCalled();
    expect(dummy).not.toHaveBeenCalled();
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
  });

  it('LG-32 (DN-16) NgungHoatDong VÀ đang khoá tạm: báo ngưng hoạt động (trạng thái đứng trước khoá)', async () => {
    const account = await newLoginAccount(db, {
      trangThai: 'NgungHoatDong',
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });

    await expectRefused(
      fx.login.login(loginBody(account)),
      403,
      'TAI_KHOAN_NGUNG',
    );
  });

  it('LG-33 thân TAI_KHOAN_NGUNG của đăng nhập GIỐNG HỆT của verify-otp (A6-D): cùng mã, trạng thái và câu chữ', async () => {
    const registered = await registerPatient(db, fx);
    await db
      .getRepository(TaiKhoan)
      .update(
        { taiKhoanId: registered.taiKhoanId },
        { trangThai: 'NgungHoatDong' },
      );

    const fromVerify = await expectRefused(
      fx.verification.verifyOtp(verifyBody(registered)),
      403,
      'TAI_KHOAN_NGUNG',
    );
    const fromLogin = await expectRefused(
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
      403,
      'TAI_KHOAN_NGUNG',
    );

    expect(fromLogin.getResponse()).toEqual(fromVerify.getResponse());
  });
});

describe('chưa xác minh email', () => {
  it('LG-40 (DN-17) đúng mật khẩu: 403 EMAIL_CHUA_XAC_MINH kèm mã lần gửi của hàng đã gửi mới nhất; KHÔNG phiên; KHÔNG gửi thư; bộ đếm về 0', async () => {
    const registered = await registerPatient(db, fx);
    await setFailureState(db, registered.taiKhoanId, {
      soLanDangNhapSai: 3,
      khoaDangNhapDen: null,
    });
    const mailBefore = fx.mail.attempts.length;

    const error = await expectRefused(
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );

    expect(bodyOf(error).chiTiet).toEqual({
      maXacThucId: registered.id,
      trangThaiMa: 'ConHan',
      hetHanLuc: at(10 * 60).toISOString(),
    });
    expect(await sessionCount(db)).toBe(0);
    expect(fx.mail.attempts).toHaveLength(mailBefore);
    expect(await failureState(db, registered.taiKhoanId)).toEqual({
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
  });

  it('LG-41 (DN-18) chưa xác minh + SAI mật khẩu: thông báo chung (không hé lộ trạng thái xác minh), có đếm; sai đủ 5 lần thì khoá như thường', async () => {
    const registered = await registerPatient(db, fx);

    for (let attempt = 1; attempt <= 4; attempt++) {
      await expectRefused(
        fx.login.login({ email: registered.email, matKhau: WRONG_PASSWORD }),
        401,
        'DANG_NHAP_SAI',
      );
    }
    await expectRefused(
      fx.login.login({ email: registered.email, matKhau: WRONG_PASSWORD }),
      429,
      'TAI_KHOAN_BI_KHOA_TAM',
    );
    expect(await failureState(db, registered.taiKhoanId)).toEqual({
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
  });

  it('LG-42 (DN-19) chưa xác minh + đang khoá: 429, kể cả khi mật khẩu đúng', async () => {
    const registered = await registerPatient(db, fx);
    await setFailureState(db, registered.taiKhoanId, {
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });

    await expectRefused(
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
      429,
      'TAI_KHOAN_BI_KHOA_TAM',
    );
  });

  it('LG-43 (DN-37) mã cũ đã hết hạn: trangThaiMa HetHan, vẫn kèm mã lần gửi và hạn cũ', async () => {
    const registered = await registerPatient(db, fx);
    vi.setSystemTime(at(601));

    const error = await expectRefused(
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );

    expect(bodyOf(error).chiTiet).toEqual({
      maXacThucId: registered.id,
      trangThaiMa: 'HetHan',
      hetHanLuc: at(600).toISOString(),
    });
  });

  it('LG-44 (DN-37) mã bị thu hồi do nhập sai 5 lần: trangThaiMa DaThuHoi; sau đó "Gửi lại mã" của A6 dùng được mã lần gửi trong phản hồi', async () => {
    const registered = await registerPatient(db, fx);
    for (let i = 0; i < 5; i++) {
      await appExceptionOf(
        fx.verification.verifyOtp(
          verifyBody(registered, { otp: wrongCodeFor(registered.code) }),
        ),
      );
    }

    const error = await expectRefused(
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );

    const detail = bodyOf(error).chiTiet;
    expect(detail?.['trangThaiMa']).toBe('DaThuHoi');
    expect(detail?.['maXacThucId']).toBe(registered.id);
    vi.setSystemTime(at(61));
    await expect(
      fx.verification.resendOtp(
        resendBody({
          email: registered.email,
          id: String(detail?.['maXacThucId']),
        }),
      ),
    ).resolves.toMatchObject({ maXacThucId: expect.any(String) });
  });

  it('LG-45 (DN-37) lần gửi đầu bị lỗi (hàng chưa gửi thành công): trangThaiMa ChuaGui, mã lần gửi là hàng mới nhất', async () => {
    fx.mail.failNextWith('CONNECTION');
    const registerError = await appExceptionOf(
      fx.service.register({
        hoTen: 'Nguyễn Văn A',
        email: 'gui.loi@example.com',
        soDienThoai: '0901234567',
        matKhau: REGISTER_PASSWORD,
      }),
    );
    expect(registerError.maLoi).toBe('GUI_MAIL_LOI');

    const error = await expectRefused(
      fx.login.login({
        email: 'gui.loi@example.com',
        matKhau: REGISTER_PASSWORD,
      }),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );

    const detail = bodyOf(error).chiTiet;
    expect(detail?.['trangThaiMa']).toBe('ChuaGui');
    const account = await accountByEmail(db, 'gui.loi@example.com');
    const rows = await db
      .getRepository(MaXacThuc)
      .find({ where: { taiKhoanId: account?.taiKhoanId } });
    expect(detail?.['maXacThucId']).toBe(rows[0]?.maXacThucId);
  });

  it('LG-46 (DN-38) quên mật khẩu đã thu hồi mã đăng ký (N3): trangThaiMa CanDangKyLai, mã lần gửi và hạn là null', async () => {
    const registered = await registerPatient(db, fx);
    await fx.otp.transaction(async (em) => {
      await fx.otp.revokePending(registered.taiKhoanId, 'DangKy', {
        manager: em,
      });
      await fx.otp.clearRegistrationData(registered.taiKhoanId, {
        manager: em,
      });
    });

    const error = await expectRefused(
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );

    expect(bodyOf(error).chiTiet).toEqual({
      maXacThucId: null,
      trangThaiMa: 'CanDangKyLai',
      hetHanLuc: null,
    });
  });

  it('LG-47 (TECH_DEBT 32) quá 24 giờ mà job chưa dọn: CanDangKyLai dù mã gửi lại vẫn còn hạn; 23:59:59 vẫn theo mã; không xoá, không ghi', async () => {
    const registered = await registerPatient(db, fx);
    vi.setSystemTime(at(DAY - 300));
    await fx.verification.resendOtp(resendBody(registered)); // mã mới sống tới DAY + 300

    vi.setSystemTime(at(DAY - 1));
    const before = await expectRefused(
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );
    expect(bodyOf(before).chiTiet?.['trangThaiMa']).toBe('ConHan');

    vi.setSystemTime(at(DAY));
    const snapshot = await snapshotOf(db);
    const after = await expectRefused(
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );
    expect(bodyOf(after).chiTiet).toEqual({
      maXacThucId: null,
      trangThaiMa: 'CanDangKyLai',
      hetHanLuc: null,
    });
    expect(await snapshotOf(db)).toEqual(snapshot);
    expect(await accountByEmail(db, registered.email)).not.toBeNull();
  });

  it('LG-48 mã lần gửi là hàng DangKy ĐÃ GỬI mới nhất, không phải hàng QuenMatKhau hay hàng gửi lỗi mới hơn', async () => {
    const registered = await registerPatient(db, fx);
    vi.setSystemTime(at(61));
    const resent = await fx.verification.resendOtp(resendBody(registered));
    // hàng QuenMatKhau mới hơn (nhiễu)
    await issueOk(fx.otp, forgotInput(registered.taiKhoanId));
    // hàng DangKy mới hơn nhưng gửi lỗi
    vi.setSystemTime(at(125));
    fx.mail.failNextWith('CONNECTION');
    await appExceptionOf(
      fx.verification.resendOtp(
        resendBody({ email: registered.email, id: resent.maXacThucId }),
      ),
    );

    const error = await expectRefused(
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );

    expect(bodyOf(error).chiTiet?.['maXacThucId']).toBe(resent.maXacThucId);
  });

  it('LG-49 (Đ12) nhân sự đang hoạt động mà chưa xác minh email (dữ liệu không nhất quán): KHÔNG phiên, 403 EMAIL_CHUA_XAC_MINH CanDangKyLai, ghi MỘT dòng ERROR chỉ có mã tài khoản', async () => {
    const levels = captureLogsByLevel();
    const staff = await newLoginAccount(db, {
      loaiTaiKhoan: 'LeTan',
      daXacMinhEmail: false,
    });

    const error = await expectRefused(
      fx.login.login(loginBody(staff)),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );

    expect(bodyOf(error).chiTiet?.['trangThaiMa']).toBe('CanDangKyLai');
    expect(await sessionRowsOf(db, staff.taiKhoanId)).toHaveLength(0);
    expect(levels.error).toHaveLength(1);
    expect(levels.error[0]).toContain(`Tài khoản ${staff.taiKhoanId}`);
    expect(levels.error[0]).toContain('dữ liệu không nhất quán');
    expect(levels.error[0]).not.toContain(staff.email);
    expect(await failureState(db, staff.taiKhoanId)).toEqual({
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
  });

  it('LG-50 (DN-20) luồng liền: đăng nhập bị từ chối → "Gửi lại mã" bằng mã lần gửi trong phản hồi → OTP đúng → đăng nhập được, có hồ sơ bệnh nhân', async () => {
    const registered = await registerPatient(db, fx);
    const refused = await expectRefused(
      fx.login.login({ email: registered.email, matKhau: REGISTER_PASSWORD }),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );
    const id = String(bodyOf(refused).chiTiet?.['maXacThucId']);
    vi.setSystemTime(at(61));
    const resent = await fx.verification.resendOtp(
      resendBody({ email: registered.email, id }),
    );
    const mail = fx.mail.attempts.at(-1);
    if (!mail) throw new Error('chưa có thư gửi lại');

    await fx.verification.verifyOtp({
      email: registered.email,
      maXacThucId: resent.maXacThucId,
      otp: readOtpFromMail(mail),
    });
    const { vaiTro } = await fx.login.login({
      email: registered.email,
      matKhau: REGISTER_PASSWORD,
    });

    expect(vaiTro).toBe('BenhNhan');
    expect(await sessionRowsOf(db, registered.taiKhoanId)).toHaveLength(1);
    expect((await accountByEmail(db, registered.email))?.daXacMinhEmail).toBe(
      true,
    );
  });
});

describe('kiểm lại DƯỚI KHOÁ hàng tài khoản (A8-E: pha đọc không khoá, băm chậm, tài khoản đổi giữa chừng)', () => {
  /** Giữ lần đăng nhập đúng ngay SAU khi băm xong (chưa vào giao dịch) để test đổi tài khoản rồi cho chạy tiếp. */
  function pauseAfterVerify() {
    const reached = deferred();
    const release = deferred();
    const realVerify = fx.hasher.verify.bind(fx.hasher);
    vi.spyOn(fx.hasher, 'verify').mockImplementation(async (hash, plain) => {
      const ok = await realVerify(hash, plain);
      reached.resolve();
      await release.promise;
      return ok;
    });
    return { reached: reached.promise, release: release.resolve };
  }

  it('LG-60 (CJ-14) lần sai thứ 5 đang GIỮ khoá hàng, đăng nhập ĐÚNG chờ khoá rồi thấy đã khoá ⇒ 429, KHÔNG phiên', async () => {
    const account = await newLoginAccount(db);
    await setFailureState(db, account.taiKhoanId, {
      soLanDangNhapSai: 4,
      khoaDangNhapDen: null,
    });
    const entered = deferred();
    const release = deferred();
    const realSave = fx.accounts.saveLoginFailure.bind(fx.accounts);
    vi.spyOn(fx.accounts, 'saveLoginFailure').mockImplementation(
      async (em, id, next) => {
        entered.resolve();
        await release.promise;
        return realSave(em, id, next);
      },
    );
    const fifth = appExceptionOf(
      fx.login.login(loginBody(account, WRONG_PASSWORD)),
    );
    await Promise.race([entered.promise, fifth]); // lần sai thứ 5 đã giữ khoá hàng, CHƯA ghi
    let correctDone = false;
    const correct = appExceptionOf(fx.login.login(loginBody(account))).then(
      (error) => {
        correctDone = true;
        return error;
      },
    );

    await sleep(400); // chờ thật: nếu đăng nhập đúng không bị chặn bởi khoá hàng thì nó đã tạo phiên xong
    expect(correctDone).toBe(false);
    release.resolve();
    const [fifthError, correctError] = await Promise.all([fifth, correct]);

    expect(fifthError.maLoi).toBe('TAI_KHOAN_BI_KHOA_TAM');
    expect(correctError.getStatus()).toBe(429);
    expect(correctError.maLoi).toBe('TAI_KHOAN_BI_KHOA_TAM');
    expect(bodyOf(correctError).chiTiet?.['soGiayConLai']).toBe(LOCK);
    expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(0);
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
  });

  it('LG-61 admin ngưng tài khoản SAU khi đọc và băm: đăng nhập đúng thấy đã ngưng dưới khoá ⇒ 403 TAI_KHOAN_NGUNG, không phiên, bộ đếm không đổi', async () => {
    const account = await newLoginAccount(db);
    const { reached, release } = pauseAfterVerify();
    const pending = appExceptionOf(fx.login.login(loginBody(account)));
    await Promise.race([reached, pending]);
    await db
      .getRepository(TaiKhoan)
      .update(
        { taiKhoanId: account.taiKhoanId },
        { trangThai: 'NgungHoatDong' },
      );
    release();

    const error = await pending;

    expect(error.getStatus()).toBe(403);
    expect(error.maLoi).toBe('TAI_KHOAN_NGUNG');
    expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(0);
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
  });

  it('LG-62 tài khoản bị khoá tạm SAU khi đọc (lần sai khác vừa chạm 5) rồi mới tới lượt mật khẩu sai: không đếm thêm, 429', async () => {
    const account = await newLoginAccount(db);
    await setFailureState(db, account.taiKhoanId, {
      soLanDangNhapSai: 4,
      khoaDangNhapDen: null,
    });
    const { reached, release } = pauseAfterVerify();
    const pending = appExceptionOf(
      fx.login.login(loginBody(account, WRONG_PASSWORD)),
    );
    await Promise.race([reached, pending]);
    await setFailureState(db, account.taiKhoanId, {
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
    release();

    const error = await pending;

    expect(error.getStatus()).toBe(429);
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
  });

  it('LG-63 mật khẩu đổi SAU khi đọc (đặt lại mật khẩu): kết quả so là của băm cũ nên KHÔNG tạo phiên và KHÔNG đếm; thân DANG_NHAP_SAI', async () => {
    const account = await newLoginAccount(db);
    const { reached, release } = pauseAfterVerify();
    const pending = appExceptionOf(fx.login.login(loginBody(account)));
    await Promise.race([reached, pending]);
    await db
      .getRepository(TaiKhoan)
      .update(
        { taiKhoanId: account.taiKhoanId },
        { matKhauBam: await fx.hasher.hash('Mat-Khau-Moi-Sau-Khi-Dat-Lai-5#') },
      );
    release();

    const error = await pending;

    expect(error.getStatus()).toBe(401);
    expect(error.maLoi).toBe('DANG_NHAP_SAI');
    expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(0);
    expect((await failureState(db, account.taiKhoanId)).soLanDangNhapSai).toBe(
      0,
    );
  });

  it('LG-64 tài khoản vừa được xác minh SAU khi đọc: quyết định theo cờ MỚI NHẤT dưới khoá ⇒ tạo phiên (không báo chưa xác minh)', async () => {
    const account = await newLoginAccount(db, { daXacMinhEmail: false });
    const { reached, release } = pauseAfterVerify();
    const pending = fx.login.login(loginBody(account));
    await Promise.race([reached, pending.catch(() => undefined)]);
    await db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: account.taiKhoanId }, { daXacMinhEmail: true });
    release();

    const { vaiTro } = await pending;

    expect(vaiTro).toBe('BenhNhan');
    expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(1);
  });

  it('LG-65 tài khoản bị xoá SAU khi đọc (job dọn A7): 401 DANG_NHAP_SAI như email lạ, không 500, không phiên', async () => {
    const account = await newLoginAccount(db);
    const { reached, release } = pauseAfterVerify();
    const pending = appExceptionOf(fx.login.login(loginBody(account)));
    await Promise.race([reached, pending]);
    await db.getRepository(TaiKhoan).delete({ taiKhoanId: account.taiKhoanId });
    release();

    const error = await pending;

    expect(error.getStatus()).toBe(401);
    expect(error.maLoi).toBe('DANG_NHAP_SAI');
    expect(await sessionCount(db)).toBe(0);
  });
});

describe('DN-21 ở mức OtpService (phần HTTP làm ở A11)', () => {
  it('LG-70 (DN-21) tài khoản đang bị khoá đăng nhập vẫn cấp được OTP QuenMatKhau: khoá đăng nhập không đụng tới ma_xac_thuc', async () => {
    const account = await newLoginAccount(db);
    await failTimes(account.email, 5);
    expect(
      (await failureState(db, account.taiKhoanId)).khoaDangNhapDen,
    ).toEqual(at(LOCK));

    const result = await fx.otp.issueAndDeliver(
      { taiKhoanId: account.taiKhoanId, loai: 'QuenMatKhau' },
      { email: account.email, fullName: account.hoTen },
    );

    expect(result.ok).toBe(true);
    expect(fx.mail.sent).toHaveLength(1);
  });
});
