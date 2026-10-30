import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertMaXacThuc } from '../entities/testing/auth-fixtures.js';
import { currentSecond } from '../otp/otp-time.js';
import {
  forgotRows,
  lastCode,
  newResetAccount,
} from '../testing/forgot-password-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  LOGIN_PASSWORD,
  failureState,
  loginBody,
  newLoginAccount,
  sessionRowsOf,
  setFailureState,
} from '../testing/login-int-helpers.js';
import { at } from '../testing/otp-int-helpers.js';
import {
  NEW_PASSWORD,
  accountState,
  createResetFixture,
  resetInput,
  tokenFor,
  type ResetFixture,
} from '../testing/reset-password-int-helpers.js';
import {
  expectRefused,
  patientRows,
  registerPatient,
  resendBody,
  verifyBody,
  walletRows,
} from '../testing/verification-int-helpers.js';
import { notRegistered } from './forgot-password.service.js';

// Task A12 — đặt mật khẩu mới trên MySQL 8.4 THẬT, MailService giả, đồng hồ giả (`at(giây)` kể từ T0). Test case: QM-01, QM-11 đến QM-20 (QM-08 qua HTTP:
// e2e; QM-21 và các ca đua: reset-password.concurrency.int-spec.ts; nhiều tài khoản: reset-password.multi-account.int-spec.ts); Q6, Q8, S2, S4, N3, N6, N7.
// Mã MK-nn là [đề xuất].
const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;
const EXPIRED = 'RESET_TOKEN_HET_HIEU_LUC';
const LATER_PASSWORD = 'Mat-Khau-Lan-Moi-3#';

let db: DataSource;
let fx: ResetFixture<FakeMailService>;
let logs: string[];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  fx = createResetFixture(testDb);
});

const reset = (token: string, password: string = NEW_PASSWORD) =>
  fx.reset.reset(resetInput(token, password));
const accountRow = (taiKhoanId: string) =>
  db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId });
const passwordIs = async (taiKhoanId: string, plain: string) =>
  fx.hasher.verify((await accountRow(taiKhoanId)).matKhauBam ?? '', plain);
/** Toàn bộ dữ liệu của MỘT tài khoản mà đặt mật khẩu có thể chạm tới: so trước/sau. */
const stateOf = async (taiKhoanId: string) => ({
  ...(await accountState(db, taiKhoanId)),
  sessions: await sessionRowsOf(db, taiKhoanId),
});

describe('đặt lại thành công (QM-01, QM-15, QM-16, QM-19, Q10)', () => {
  it('MK-01 QM-01 toàn luồng: mật khẩu mới đăng nhập được ngay, mật khẩu cũ thì không; hàng OTP đã dùng đúng lúc đặt; băm Argon2id đúng tham số S6; không thư nào', async () => {
    const account = await newLoginAccount(db);
    const token = await tokenFor(fx, account.email);
    vi.setSystemTime(at(30));

    expect(await reset(token)).toEqual({
      taiKhoanNgung: false,
      canDangKyLai: false,
    });

    const after = await accountRow(account.taiKhoanId);
    expect(after.matKhauBam).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
    expect(after.daXacMinhEmail).toBe(true);
    const [row] = await forgotRows(db, account.taiKhoanId);
    expect(row).toMatchObject({ daDungLuc: at(30), thuHoiLuc: null });
    expect(fx.mail.attempts).toHaveLength(1); // chỉ thư OTP của bước 1
    expect(
      (await fx.login.login(loginBody(account, NEW_PASSWORD))).vaiTro,
    ).toBe('BenhNhan');
    await expectRefused(
      fx.login.login(loginBody(account, LOGIN_PASSWORD)),
      401,
      'DANG_NHAP_SAI',
    );
    expect(logs.join('\n')).toContain(
      `Tài khoản ${account.taiKhoanId} đặt lại mật khẩu (mã xác thực ${row?.maXacThucId}): thu hồi 0 phiên, 0 mã đăng ký`,
    );
  });

  it('MK-02 QM-15 đang bị khoá đăng nhập tạm: bộ đếm về 0, khoá NULL, đăng nhập bằng mật khẩu mới được NGAY', async () => {
    const account = await newLoginAccount(db);
    await setFailureState(db, account.taiKhoanId, {
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(900),
    });
    const token = await tokenFor(fx, account.email);

    await reset(token);

    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
    await fx.login.login(loginBody(account, NEW_PASSWORD));
  });

  it('MK-03 QM-15 bộ đếm sai đang dở (3 lần, chưa khoá) cũng về 0', async () => {
    const account = await newLoginAccount(db);
    await setFailureState(db, account.taiKhoanId, {
      soLanDangNhapSai: 3,
      khoaDangNhapDen: null,
    });

    await reset(await tokenFor(fx, account.email));

    expect((await failureState(db, account.taiKhoanId)).soLanDangNhapSai).toBe(
      0,
    );
  });

  it('MK-04 QM-16 Q8 thu hồi MỌI phiên (cả ba phiên sống), phiên đã thu hồi trước giữ nguyên mốc cũ; refresh token và access token cũ hết tác dụng; phiên của tài khoản KHÁC không bị đụng', async () => {
    const account = await newLoginAccount(db);
    const other = await newLoginAccount(db);
    // Phiên đã thu hồi tạo TRƯỚC, phiên sống tạo SAU: phiên có id lớn nhất là phiên ĐANG SỐNG, nên "chừa phiên mới nhất" cũng bị bắt (đột biến M13)
    const old = await fx.sessionService.create(account.taiKhoanId);
    vi.setSystemTime(at(-10));
    await fx.sessionService.revoke(old.sessionId);
    vi.setSystemTime(at(0));
    const live = [
      await fx.sessionService.create(account.taiKhoanId),
      await fx.sessionService.create(account.taiKhoanId),
      await fx.sessionService.create(account.taiKhoanId),
    ];
    const otherSession = await fx.sessionService.create(other.taiKhoanId);
    const token = await tokenFor(fx, account.email);
    vi.setSystemTime(at(20));

    await reset(token);

    const rows = await sessionRowsOf(db, account.taiKhoanId);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.thuHoiLuc).toEqual(
        row.phienDangNhapId === old.sessionId ? at(-10) : at(20),
      );
    }
    for (const session of live) {
      expect(
        await fx.sessionService.refresh(session.refreshToken),
      ).toMatchObject({ ok: false, reason: 'SESSION_REVOKED' });
      expect(
        await fx.sessionService.resolveActive({
          accountId: account.taiKhoanId,
          sessionId: session.sessionId,
        }),
      ).toBeNull();
    }
    expect(
      (await sessionRowsOf(db, other.taiKhoanId))[0]?.thuHoiLuc,
    ).toBeNull();
    expect(
      await fx.sessionService.refresh(otherSession.refreshToken),
    ).toMatchObject({ ok: true });
    expect(logs.join('\n')).toContain('thu hồi 3 phiên');
  });

  it('MK-05 QM-19 S4 NgungHoatDong có mật khẩu: mật khẩu ĐÃ đổi, vẫn ngưng, cờ taiKhoanNgung; đăng nhập bằng mật khẩu mới vẫn 403 TAI_KHOAN_NGUNG', async () => {
    const account = await newResetAccount(db, 'suspended');
    await fx.sessionService.create(account.taiKhoanId);

    expect(await reset(await tokenFor(fx, account.email))).toEqual({
      taiKhoanNgung: true,
      canDangKyLai: false,
    });

    expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
    expect((await accountRow(account.taiKhoanId)).trangThai).toBe(
      'NgungHoatDong',
    );
    expect((await sessionRowsOf(db, account.taiKhoanId))[0]?.thuHoiLuc).toEqual(
      at(0),
    );
    await expectRefused(
      fx.login.login(loginBody(account, NEW_PASSWORD)),
      403,
      'TAI_KHOAN_NGUNG',
    );
  });

  it('MK-06 nhân sự đang hoạt động: đặt lại được, hai cờ đều false', async () => {
    const account = await newResetAccount(db, 'staff');

    expect(await reset(await tokenFor(fx, account.email))).toEqual({
      taiKhoanNgung: false,
      canDangKyLai: false,
    });
    expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
  });

  it('MK-07 Q10 mật khẩu mới TRÙNG mật khẩu cũ: không chặn; phiên vẫn bị thu hồi, đăng nhập bằng mật khẩu đó vẫn được', async () => {
    const account = await newLoginAccount(db);
    await fx.sessionService.create(account.taiKhoanId);

    await reset(await tokenFor(fx, account.email), LOGIN_PASSWORD);

    expect(
      (await sessionRowsOf(db, account.taiKhoanId))[0]?.thuHoiLuc,
    ).not.toBeNull();
    await fx.login.login(loginBody(account, LOGIN_PASSWORD));
  });
});

describe('tài khoản chưa xác minh (QM-17, QM-18; Q6, N3)', () => {
  /** Bệnh nhân chưa xác minh đăng ký HAI lần (mã DangKy đầu bị mã sau thay), rồi có resetToken lúc 62 giây. */
  async function unverifiedWithToken() {
    const email = 'chua.xac.minh@example.com';
    await registerPatient(db, fx, { email });
    vi.setSystemTime(at(61));
    const second = await registerPatient(db, fx, { email });
    vi.setSystemTime(at(62));
    const token = await tokenFor(fx, email);
    return { email, second, token };
  }

  it('MK-08 QM-17 đổi mật khẩu của tài khoản; da_xac_minh_email KHÔNG đổi; không benh_nhan, không ví; MỌI hàng DangKy chưa dùng bị thu hồi VÀ ba cột dữ liệu đăng ký về NULL; hàng đã thu hồi trước giữ mốc cũ; cờ canDangKyLai', async () => {
    const { second, token } = await unverifiedWithToken();
    vi.setSystemTime(at(70));

    expect(await reset(token)).toEqual({
      taiKhoanNgung: false,
      canDangKyLai: true,
    });

    const account = await accountRow(second.taiKhoanId);
    expect(account.daXacMinhEmail).toBe(false);
    expect(await passwordIs(second.taiKhoanId, NEW_PASSWORD)).toBe(true);
    expect(await patientRows(db)).toHaveLength(0);
    expect(await walletRows(db)).toHaveLength(0);
    const registrations = await forgotRows(db, second.taiKhoanId, 'DangKy');
    expect(
      registrations.map((row) => [
        row.thuHoiLuc,
        row.daDungLuc,
        row.hoTenDangKy,
        row.soDienThoaiDangKy,
        row.matKhauBamDangKy,
      ]),
    ).toEqual([
      [at(61), null, null, null, null],
      [at(70), null, null, null, null],
    ]);
    expect(logs.join('\n')).toContain('thu hồi 0 phiên, 1 mã đăng ký');
  });

  it('MK-09 QM-17 sau đặt lại: xác minh hay gửi lại mã đăng ký cũ ⇒ 409 CAN_DANG_KY_LAI; đăng nhập bằng mật khẩu mới ⇒ 403 EMAIL_CHUA_XAC_MINH với CanDangKyLai (không phiên)', async () => {
    const { email, second, token } = await unverifiedWithToken();
    await reset(token);
    vi.setSystemTime(at(200));

    await expectRefused(
      fx.verification.verifyOtp(verifyBody(second)),
      409,
      'CAN_DANG_KY_LAI',
    );
    await expectRefused(
      fx.verification.resendOtp(resendBody(second)),
      409,
      'CAN_DANG_KY_LAI',
    );
    const refusal = await expectRefused(
      fx.login.login({ email, matKhau: NEW_PASSWORD }),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );
    expect(refusal.getResponse()).toMatchObject({
      chiTiet: { trangThaiMa: 'CanDangKyLai', maXacThucId: null },
    });
    expect(await sessionRowsOf(db, second.taiKhoanId)).toHaveLength(0);
  });

  it('MK-10 QM-18 sau QM-17, đăng ký lại cùng email với dữ liệu MỚI rồi xác minh bằng OTP mới: tai_khoan nhận họ tên, SĐT, mật khẩu của lần mới; mật khẩu đặt lại hết hiệu lực; có benh_nhan và ví', async () => {
    const { email, second, token } = await unverifiedWithToken();
    await reset(token);
    vi.setSystemTime(at(200));

    const again = await registerPatient(db, fx, {
      email,
      hoTen: 'Trần Thị B',
      soDienThoai: '0912345678',
      matKhau: LATER_PASSWORD,
    });
    await fx.verification.verifyOtp(verifyBody(again));

    expect(again.taiKhoanId).toBe(second.taiKhoanId);
    expect(await accountRow(second.taiKhoanId)).toMatchObject({
      hoTen: 'Trần Thị B',
      soDienThoai: '0912345678',
      daXacMinhEmail: true,
    });
    expect(await passwordIs(second.taiKhoanId, LATER_PASSWORD)).toBe(true);
    expect(await passwordIs(second.taiKhoanId, NEW_PASSWORD)).toBe(false);
    expect(await patientRows(db)).toHaveLength(1);
    expect(await walletRows(db)).toHaveLength(1);
    await fx.login.login({ email, matKhau: LATER_PASSWORD });
  });

  it('MK-11 Bệnh nhân chưa xác minh bị NgungHoatDong: đặt lại được, mã DangKy vẫn bị thu hồi và xoá dữ liệu (N3), cờ taiKhoanNgung=true, canDangKyLai=false (A5-F: đăng ký lại sẽ EMAIL_DA_DUNG)', async () => {
    const account = await newResetAccount(db, 'unverified', {
      trangThai: 'NgungHoatDong',
    });
    await insertMaXacThuc(db, account.taiKhoanId, { daGuiLuc: at(-30) });

    expect(await reset(await tokenFor(fx, account.email))).toEqual({
      taiKhoanNgung: true,
      canDangKyLai: false,
    });

    expect(await forgotRows(db, account.taiKhoanId, 'DangKy')).toMatchObject([
      { thuHoiLuc: at(0), hoTenDangKy: null, matKhauBamDangKy: null },
    ]);
  });

  it('MK-12 tài khoản ĐÃ xác minh: hàng DangKy (đã dùng từ lúc xác minh) không bị đụng', async () => {
    const account = await newResetAccount(db, 'verified');
    const used = await insertMaXacThuc(db, account.taiKhoanId, {
      daGuiLuc: at(-100),
      daDungLuc: at(-90),
      hoTenDangKy: null,
      soDienThoaiDangKy: null,
      matKhauBamDangKy: null,
    });

    await reset(await tokenFor(fx, account.email));

    expect(
      await db.getRepository(MaXacThuc).findOneByOrFail({
        maXacThucId: used.maXacThucId,
      }),
    ).toMatchObject({ thuHoiLuc: null, daDungLuc: at(-90) });
  });
});

describe('token và hàng OTP (QM-11, QM-12, QM-13; N6)', () => {
  it.each([
    [599, true],
    [600, false],
    [601, false],
  ])(
    'MK-13 QM-11 hạn 10 phút TỪ LÚC XÁC MINH, nửa mở: đặt lúc %i giây sau xác minh ⇒ thành công=%s; bị từ chối thì 403 và KHÔNG ghi gì (OTP vẫn chưa dùng)',
    async (seconds, allowed) => {
      const account = await newResetAccount(db, 'verified');
      vi.setSystemTime(at(100));
      const token = await tokenFor(fx, account.email); // xác minh lúc 100
      const before = await stateOf(account.taiKhoanId);
      vi.setSystemTime(at(100 + seconds));

      if (allowed) {
        await reset(token);
        expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
      } else {
        await expectRefused(reset(token), 403, EXPIRED);
        expect(await stateOf(account.taiKhoanId)).toEqual(before);
      }
    },
  );

  it('MK-14 N6 KHÔNG kiểm lại hạn của OTP: mã cấp lúc 0 (hết hạn lúc 600), xác minh lúc 500, đặt lúc 1000 ⇒ thành công', async () => {
    const account = await newResetAccount(db, 'verified');
    await fx.forgot.requestCode(account.email);
    vi.setSystemTime(at(500));
    const { resetToken } = await fx.forgot.verifyCode(
      account.email,
      lastCode(fx.mail),
    );
    vi.setSystemTime(at(1000));

    await reset(resetToken);

    expect((await forgotRows(db, account.taiKhoanId))[0]?.daDungLuc).toEqual(
      at(1000),
    );
  });

  it.each([
    ['chuỗi rác', 'khong.phai.jwt'],
    ['access token đăng nhập (khoá và mục đích khác, QM-14)', 'ACCESS'],
  ])(
    'MK-15 QM-11 token %s: 403 RESET_TOKEN_HET_HIEU_LUC, KHÔNG ghi gì',
    async (_label, value) => {
      const account = await newLoginAccount(db);
      const session = await fx.sessionService.create(account.taiKhoanId);
      const before = await stateOf(account.taiKhoanId);

      await expectRefused(
        reset(value === 'ACCESS' ? session.accessToken : value),
        403,
        EXPIRED,
      );

      expect(await stateOf(account.taiKhoanId)).toEqual(before);
    },
  );

  it('MK-16 QM-13 dùng lại token sau khi đặt lại thành công: 403, mật khẩu giữ bản vừa đặt', async () => {
    const account = await newResetAccount(db, 'verified');
    const token = await tokenFor(fx, account.email);
    await reset(token);
    const after = await stateOf(account.taiKhoanId);

    await expectRefused(reset(token, LATER_PASSWORD), 403, EXPIRED);

    expect(await stateOf(account.taiKhoanId)).toEqual(after);
    expect(logs.join('\n')).toContain('mã đã được dùng để đặt mật khẩu');
  });

  it('MK-17 QM-13 TECH_DEBT 44 token còn sống nhưng đã bấm "Gửi lại mã" (mã mới gửi xong thu hồi mã cũ): 403; token cấp từ mã MỚI thì dùng được', async () => {
    const account = await newResetAccount(db, 'verified');
    const oldToken = await tokenFor(fx, account.email);
    vi.setSystemTime(at(61));
    await fx.forgot.requestCode(account.email);
    const before = await stateOf(account.taiKhoanId);

    await expectRefused(reset(oldToken), 403, EXPIRED);
    expect(await stateOf(account.taiKhoanId)).toEqual(before);
    expect(logs.join('\n')).toContain('mã đã bị thu hồi vì mã mới hơn đã gửi');

    const { resetToken } = await fx.forgot.verifyCode(
      account.email,
      lastCode(fx.mail),
    );
    await reset(resetToken);
    expect(await passwordIs(account.taiKhoanId, NEW_PASSWORD)).toBe(true);
  });

  it('MK-18 QM-13 hàng OTP bị thu hồi vì nhập sai đủ 5 lần sau khi đã có token: 403', async () => {
    const account = await newResetAccount(db, 'verified');
    const token = await tokenFor(fx, account.email);
    const [row] = await forgotRows(db, account.taiKhoanId);
    await db
      .getRepository(MaXacThuc)
      .update({ maXacThucId: row?.maXacThucId }, { thuHoiLuc: at(5) });

    await expectRefused(reset(token), 403, EXPIRED);
  });

  it('MK-19 QM-12 token ký ĐÚNG khoá nhưng sub = A, mxt = hàng OTP của B: 403, cả A và B không đổi, hàng của B vẫn chưa dùng; log ERROR "thuộc tài khoản khác"', async () => {
    const a = await newResetAccount(db, 'verified');
    const b = await newResetAccount(db, 'verified');
    await tokenFor(fx, b.email);
    const [rowOfB] = await forgotRows(db, b.taiKhoanId);
    const { token } = await fx.resetTokens.sign({
      taiKhoanId: a.taiKhoanId,
      maXacThucId: rowOfB?.maXacThucId ?? '',
      issuedAt: currentSecond(),
    });
    const before = [await stateOf(a.taiKhoanId), await stateOf(b.taiKhoanId)];

    await expectRefused(reset(token), 403, EXPIRED);

    expect([await stateOf(a.taiKhoanId), await stateOf(b.taiKhoanId)]).toEqual(
      before,
    );
    expect(logs.join('\n')).toContain(
      `Tài khoản ${a.taiKhoanId}: resetToken không dùng được (mã xác thực ${rowOfB?.maXacThucId}: hàng mã thuộc tài khoản khác); dữ liệu không nhất quán`,
    );
  });

  it('MK-20 token ký đúng khoá trỏ tới hàng DangKy của chính tài khoản (sai loại) hoặc hàng không tồn tại: 403, không ghi gì', async () => {
    const account = await newResetAccount(db, 'unverified');
    const registration = await insertMaXacThuc(db, account.taiKhoanId, {
      daGuiLuc: at(-30),
    });
    const before = await stateOf(account.taiKhoanId);

    for (const maXacThucId of [registration.maXacThucId, '999999999']) {
      const { token } = await fx.resetTokens.sign({
        taiKhoanId: account.taiKhoanId,
        maXacThucId,
        issuedAt: currentSecond(),
      });
      await expectRefused(reset(token), 403, EXPIRED);
    }

    expect(await stateOf(account.taiKhoanId)).toEqual(before);
    expect(logs.join('\n')).toContain('hàng mã không phải QuenMatKhau');
    expect(logs.join('\n')).toContain('không còn hàng mã xác thực');
  });
});

describe('kiểm LẠI tư cách tài khoản dưới khoá (hợp đồng A11 điểm 17 ý 3)', () => {
  it.each([
    [299, true],
    [300, false],
  ])(
    'MK-21 Bệnh nhân chưa xác minh hết 24 giờ TRONG 10 phút của token (tạo lúc -24h+300 giây): đặt lúc %i giây ⇒ thành công=%s; quá hạn thì 404 EMAIL_CHUA_DANG_KY (CÙNG thân của A11), không ghi gì',
    async (seconds, allowed) => {
      const account = await newResetAccount(db, 'unverified', {
        thoiDiemTao: at(-DAY + 300),
      });
      const token = await tokenFor(fx, account.email);
      const before = await stateOf(account.taiKhoanId);
      vi.setSystemTime(at(seconds));

      if (allowed) {
        expect((await reset(token)).canDangKyLai).toBe(true);
        return;
      }
      const refusal = await expectRefused(
        reset(token),
        404,
        'EMAIL_CHUA_DANG_KY',
      );
      expect(refusal.getResponse()).toEqual(notRegistered().getResponse());
      expect(await stateOf(account.taiKhoanId)).toEqual(before);
      expect(logs.join('\n')).toContain(
        `Tài khoản ${account.taiKhoanId} không được đặt lại mật khẩu: Bệnh nhân chưa xác minh đã quá 24 giờ`,
      );
    },
  );

  it.each([
    ['về ChoKichHoat', { trangThai: 'ChoKichHoat', matKhauBam: null }],
    [
      'NgungHoatDong và mất mật khẩu',
      { trangThai: 'NgungHoatDong', matKhauBam: null },
    ],
  ] as const)(
    'MK-22 nhân sự %s sau khi có token: 403 TAI_KHOAN_CHUA_KICH_HOAT, không ghi gì',
    async (_label, change) => {
      const account = await newResetAccount(db, 'staff');
      const token = await tokenFor(fx, account.email);
      await db
        .getRepository(TaiKhoan)
        .update({ taiKhoanId: account.taiKhoanId }, { ...change });
      const before = await stateOf(account.taiKhoanId);

      await expectRefused(reset(token), 403, 'TAI_KHOAN_CHUA_KICH_HOAT');

      expect(await stateOf(account.taiKhoanId)).toEqual(before);
    },
  );

  it('MK-23 tài khoản bị xoá sau khi có token (job dọn, đăng ký lại xoá lười): 403 RESET_TOKEN_HET_HIEU_LUC, không phải lỗi hệ thống', async () => {
    const account = await newResetAccount(db, 'unverified');
    const token = await tokenFor(fx, account.email);
    // Xoá như job dọn (hàng con trước, H2)
    await db
      .getRepository(MaXacThuc)
      .delete({ taiKhoanId: account.taiKhoanId });
    await db.getRepository(TaiKhoan).delete({ taiKhoanId: account.taiKhoanId });

    await expectRefused(reset(token), 403, EXPIRED);
    expect(logs.join('\n')).toContain(
      `Tài khoản ${account.taiKhoanId} không còn khi đặt lại mật khẩu`,
    );
  });

  it('MK-24 repository: câu UPDATE tự chặn ChoKichHoat (dù tầng trên kiểm sai) và vẫn ghi NgungHoatDong', async () => {
    const pending = await newResetAccount(db, 'pending-staff');
    const suspended = await newResetAccount(db, 'suspended');

    expect(
      await fx.accounts.setPasswordAfterReset(
        db.manager,
        pending.taiKhoanId,
        '$argon2id$moi',
      ),
    ).toBe(false);
    expect((await accountRow(pending.taiKhoanId)).matKhauBam).toBeNull();
    expect(
      await fx.accounts.setPasswordAfterReset(
        db.manager,
        suspended.taiKhoanId,
        '$argon2id$moi',
      ),
    ).toBe(true);
  });
});

describe('QM-20 lỗi giữa giao dịch ⇒ ROLLBACK trọn, ở TỪNG bước ghi', () => {
  // Mỗi ca để bước ghi đó CHẠY THẬT rồi ném lỗi ngay sau (việc đã ghi phải bị hoàn tác, không phải "chưa kịp ghi"). Tài khoản chưa xác minh có 2 phiên
  // và 2 hàng DangKy để mọi bước đều có việc thật.
  type Step =
    'consume' | 'mật khẩu' | 'phiên' | 'mã đăng ký' | 'dữ liệu đăng ký';
  const target = (step: Step): [object, string] => {
    switch (step) {
      case 'consume':
        return [fx.otp, 'consume'];
      case 'mật khẩu':
        return [fx.accounts, 'setPasswordAfterReset'];
      case 'phiên':
        return [fx.sessionService, 'revokeAll'];
      case 'mã đăng ký':
        return [fx.otp, 'revokePending'];
      case 'dữ liệu đăng ký':
        return [fx.otp, 'clearRegistrationData'];
    }
  };

  it.each<Step>([
    'consume',
    'mật khẩu',
    'phiên',
    'mã đăng ký',
    'dữ liệu đăng ký',
  ])(
    'MK-25 lỗi ngay SAU bước "%s": lỗi hệ thống (không phải AppException), mật khẩu cũ, OTP chưa dùng, phiên còn sống, hàng DangKy nguyên dữ liệu; sau đó CHÍNH token đó vẫn đặt được',
    async (step) => {
      const email = 'hoan.tac@example.com';
      await registerPatient(db, fx, { email });
      vi.setSystemTime(at(61));
      const registered = await registerPatient(db, fx, { email });
      await fx.sessionService.create(registered.taiKhoanId);
      await fx.sessionService.create(registered.taiKhoanId);
      const token = await tokenFor(fx, email);
      const before = await stateOf(registered.taiKhoanId);
      const [owner, method] = target(step);
      const methods = owner as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const original = methods[method]?.bind(owner);
      if (!original) throw new Error(`không có ${method}`);
      let ran = false;
      vi.spyOn(methods, method).mockImplementationOnce(async (...args) => {
        await original(...args);
        ran = true;
        throw new Error(`giả lập lỗi sau bước ${step}`);
      });

      const failure = await reset(token).catch((error: unknown) => error);

      expect(ran, 'bước ghi phải chạy thật trước khi lỗi').toBe(true);
      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(AppException);
      expect(await stateOf(registered.taiKhoanId)).toEqual(before);
      expect(await patientRows(db)).toHaveLength(0);

      expect(await reset(token)).toEqual({
        taiKhoanNgung: false,
        canDangKyLai: true,
      });
      expect(await passwordIs(registered.taiKhoanId, NEW_PASSWORD)).toBe(true);
    },
  );
});
