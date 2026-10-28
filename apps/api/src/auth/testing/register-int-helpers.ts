// Hạ tầng test tích hợp cho đăng ký (task A5, MySQL thật); A6 (xác minh, gửi lại) dùng lại.
import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { MailService } from '../../mail/mail.service.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { PasswordHasher } from '../password/password-hasher.service.js';
import { PhienDangNhapRepository } from '../repositories/phien-dang-nhap.repository.js';
import { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import { RegisterService } from '../register/register.service.js';
import type { RegisterInput } from '../register/register.types.js';
import { UnverifiedPatientCleaner } from '../register/unverified-patient-cleaner.js';
import { createOtpFixture, type OtpFixture } from './otp-int-helpers.js';
import { readOtpFromMail } from './otp-test-helpers.js';

/** Mật khẩu "thật" của test: một chuỗi riêng để quét log/đáp ứng/DB xem có lọt ra ngoài không (không trùng chuỗi nào khác). */
export const REGISTER_PASSWORD = 'Mat-Khau-Dang-Ky-9!';

export const registerBody = (
  overrides: Partial<RegisterInput> = {},
): RegisterInput => ({
  hoTen: 'Nguyễn Văn A',
  email: 'dang.ky@example.com',
  soDienThoai: '0901234567',
  matKhau: REGISTER_PASSWORD,
  ...overrides,
});

export interface RegisterFixture<
  TMail extends MailService,
> extends OtpFixture<TMail> {
  accounts: TaiKhoanRepository;
  sessions: PhienDangNhapRepository;
  hasher: PasswordHasher;
  cleaner: UnverifiedPatientCleaner;
  service: RegisterService;
}

export function createRegisterFixture(
  db: DataSource,
): RegisterFixture<FakeMailService>;
export function createRegisterFixture<TMail extends MailService>(
  db: DataSource,
  mail: TMail,
): RegisterFixture<TMail>;
export function createRegisterFixture(
  db: DataSource,
  mail: MailService = new FakeMailService(),
): RegisterFixture<MailService> {
  const otpFixture = createOtpFixture(db, mail);
  const accounts = new TaiKhoanRepository();
  const sessions = new PhienDangNhapRepository(db);
  const hasher = new PasswordHasher();
  const cleaner = new UnverifiedPatientCleaner(
    accounts,
    otpFixture.repo,
    sessions,
  );
  return {
    ...otpFixture,
    accounts,
    sessions,
    hasher,
    cleaner,
    service: new RegisterService(db, accounts, hasher, otpFixture.otp, cleaner),
  };
}

/** Lỗi AppException mà `promise` ném ra; không ném, hoặc ném lỗi khác, thì test đỏ. */
export async function appExceptionOf(
  promise: Promise<unknown>,
): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('Mong đợi AppException nhưng thao tác thành công');
}

export const accountByEmail = (
  db: DataSource,
  email: string,
): Promise<TaiKhoan | null> => db.getRepository(TaiKhoan).findOneBy({ email });

export const allAccounts = (db: DataSource): Promise<TaiKhoan[]> =>
  db.getRepository(TaiKhoan).find({ order: { taiKhoanId: 'ASC' } });

export const allOtpRows = (db: DataSource): Promise<MaXacThuc[]> =>
  db.getRepository(MaXacThuc).find({ order: { maXacThucId: 'ASC' } });

/** Mã OTP trong thư thứ `index` (0 = thư đầu tiên) mà thư giả đã nhận (kể cả thư gửi lỗi). */
export function codeOfMail(
  mail: { attempts: { text: string }[] },
  index: number,
): string {
  const message = mail.attempts[index];
  if (!message) throw new Error(`Chưa có thư thứ ${String(index)}`);
  return readOtpFromMail(message);
}
