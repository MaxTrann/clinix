// Hạ tầng test tích hợp cho quên mật khẩu (1) (task A11, MySQL thật). Dựng trên createLoginFixture của A8, nên dùng được với `measureRounds` của
// multi-account-helpers (fixture `MultiFixture` + `forgotServicesFor`).
import type { DataSource } from 'typeorm';
import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { MailService } from '../../mail/mail.service.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../entities/testing/auth-fixtures.js';
import type { PasswordResetCodeResult } from '../forgot-password/forgot-password-delivery.js';
import { ForgotPasswordService } from '../forgot-password/forgot-password.service.js';
import { ResetTokenService } from '../forgot-password/reset-token.service.js';
import { createTestConfigService } from './auth-test-config.js';
import { createLoginFixture, type LoginFixture } from './login-int-helpers.js';
import { at } from './otp-int-helpers.js';
import { readOtpFromMail } from './otp-test-helpers.js';
import type { MailWithAttempts } from './verification-int-helpers.js';

const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;

export interface ForgotServices {
  resetTokens: ResetTokenService;
  forgot: ForgotPasswordService;
}

export interface ForgotFixture<TMail extends MailService>
  extends LoginFixture<TMail>, ForgotServices {}

/** Dịch vụ quên mật khẩu dựng trên một fixture đăng nhập có sẵn (dùng cho `measureRounds`, nơi fixture do hạ tầng dựng). */
export function forgotServicesFor(
  db: DataSource,
  fx: Pick<LoginFixture<MailService>, 'accounts' | 'otp'>,
): ForgotServices {
  const resetTokens = new ResetTokenService(createTestConfigService());
  return {
    resetTokens,
    forgot: new ForgotPasswordService(db, fx.accounts, fx.otp, resetTokens),
  };
}

export function createForgotFixture(
  db: DataSource,
): ForgotFixture<FakeMailService>;
export function createForgotFixture<TMail extends MailService>(
  db: DataSource,
  mail: TMail,
): ForgotFixture<TMail>;
export function createForgotFixture(
  db: DataSource,
  mail: MailService = new FakeMailService(),
): ForgotFixture<MailService> {
  const base = createLoginFixture(db, mail);
  return { ...base, ...forgotServicesFor(db, base) };
}

/** Các loại tài khoản mà quên mật khẩu phải phân biệt (PLAN A11, Q6, S4, DN-21). Mọi mốc tính theo đồng hồ giả `at()`. */
export type ResetAccountKind =
  | 'verified' // Bệnh nhân đã xác minh
  | 'unverified' // Bệnh nhân chưa xác minh, còn trong 24 giờ (Q6)
  | 'expired-unverified' // Bệnh nhân chưa xác minh, đúng 24:00:00 tại at(0): đã quá hạn (nửa mở)
  | 'staff' // nhân sự đang hoạt động
  | 'pending-staff' // nhân sự ChoKichHoat, chưa có mật khẩu
  | 'suspended' // NgungHoatDong CÓ mật khẩu (S4, QM-19)
  | 'suspended-no-password' // NgungHoatDong chưa từng có mật khẩu (QM-04)
  | 'locked'; // đang bị khoá đăng nhập tạm (DN-21)

const KIND_FIELDS: Record<ResetAccountKind, Partial<TaiKhoan>> = {
  verified: { daXacMinhEmail: true, thoiDiemTao: at(-3600) },
  unverified: { daXacMinhEmail: false, thoiDiemTao: at(-3600) },
  'expired-unverified': { daXacMinhEmail: false, thoiDiemTao: at(-DAY) },
  staff: {
    loaiTaiKhoan: 'LeTan',
    daXacMinhEmail: true,
    thoiDiemTao: at(-3600),
  },
  'pending-staff': {
    loaiTaiKhoan: 'LeTan',
    trangThai: 'ChoKichHoat',
    matKhauBam: null,
    daXacMinhEmail: false,
    thoiDiemTao: at(-3600),
  },
  suspended: {
    trangThai: 'NgungHoatDong',
    daXacMinhEmail: true,
    thoiDiemTao: at(-3600),
  },
  'suspended-no-password': {
    loaiTaiKhoan: 'LeTan',
    trangThai: 'NgungHoatDong',
    matKhauBam: null,
    daXacMinhEmail: true,
    thoiDiemTao: at(-3600),
  },
  locked: {
    daXacMinhEmail: true,
    thoiDiemTao: at(-3600),
    soLanDangNhapSai: 5,
    khoaDangNhapDen: at(900),
  },
};

export function newResetAccount(
  db: DataSource,
  kind: ResetAccountKind,
  overrides: Partial<TaiKhoan> = {},
): Promise<TaiKhoan> {
  return insertTaiKhoan(db, { ...KIND_FIELDS[kind], ...overrides });
}

/** Mã OTP trong thư gửi cuối cùng (kể cả thư gửi lỗi) của thư giả: cách DUY NHẤT test biết mã. */
export function lastCode(mail: MailWithAttempts): string {
  const last = mail.attempts.at(-1);
  if (!last) throw new Error('chưa có thư nào');
  return readOtpFromMail(last);
}

/** Yêu cầu cấp mã rồi đọc mã từ thư giả vừa nhận. */
export async function requestAndRead(
  fx: ForgotFixture<MailWithAttempts>,
  email: string,
): Promise<{ code: string; result: PasswordResetCodeResult }> {
  const result = await fx.forgot.requestCode(email);
  return { result, code: lastCode(fx.mail) };
}

export const forgotRows = (
  db: DataSource,
  taiKhoanId: string,
  loai: 'QuenMatKhau' | 'DangKy' = 'QuenMatKhau',
): Promise<MaXacThuc[]> =>
  db.getRepository(MaXacThuc).find({
    where: { taiKhoanId, loai },
    order: { maXacThucId: 'ASC' },
  });
