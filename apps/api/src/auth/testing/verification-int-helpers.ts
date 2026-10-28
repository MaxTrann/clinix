// Hạ tầng test tích hợp cho xác minh OTP đăng ký và gửi lại mã (task A6, MySQL thật). Dựng trên createRegisterFixture của A5.
import type { DataSource } from 'typeorm';
import type { AppException } from '../../common/errors/app.exception.js';
import { MailService, type MailMessage } from '../../mail/mail.service.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { BenhNhan } from '../entities/benh-nhan.entity.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { ViNoiBo } from '../entities/vi-noi-bo.entity.js';
import { BenhNhanRepository } from '../repositories/benh-nhan.repository.js';
import { ViNoiBoRepository } from '../repositories/vi-noi-bo.repository.js';
import {
  RegisterVerificationService,
  type ResendRegistrationInput,
  type VerifyRegistrationInput,
} from '../register/register-verification.service.js';
import type { RegisterInput } from '../register/register.types.js';
import {
  accountByEmail,
  allAccounts,
  allOtpRows,
  appExceptionOf,
  createRegisterFixture,
  registerBody,
  type RegisterFixture,
} from './register-int-helpers.js';
import { readOtpFromMail } from './otp-test-helpers.js';

export type MailWithAttempts = MailService & { attempts: MailMessage[] };

export interface VerificationFixture<
  TMail extends MailService,
> extends RegisterFixture<TMail> {
  patients: BenhNhanRepository;
  wallets: ViNoiBoRepository;
  verification: RegisterVerificationService;
}

export function createVerificationFixture(
  db: DataSource,
): VerificationFixture<FakeMailService>;
export function createVerificationFixture<TMail extends MailService>(
  db: DataSource,
  mail: TMail,
): VerificationFixture<TMail>;
export function createVerificationFixture(
  db: DataSource,
  mail: MailService = new FakeMailService(),
): VerificationFixture<MailService> {
  const register = createRegisterFixture(db, mail);
  const patients = new BenhNhanRepository();
  const wallets = new ViNoiBoRepository();
  return {
    ...register,
    patients,
    wallets,
    verification: new RegisterVerificationService(
      db,
      register.accounts,
      patients,
      wallets,
      register.repo,
      register.otp,
    ),
  };
}

/** Một lần đăng ký đã xong: email, mã lần gửi, mã OTP đọc từ thư (cách DUY NHẤT test biết mã) và mã tài khoản. */
export interface Registered {
  email: string;
  id: string;
  code: string;
  taiKhoanId: string;
}

/** Đăng ký qua RegisterService (băm mật khẩu thật) rồi đọc mã từ thư giả vừa nhận. */
export async function registerPatient(
  db: DataSource,
  fx: VerificationFixture<MailWithAttempts>,
  overrides: Partial<RegisterInput> = {},
): Promise<Registered> {
  const input = registerBody(overrides);
  const result = await fx.service.register(input);
  const last = fx.mail.attempts[fx.mail.attempts.length - 1];
  const account = await accountByEmail(db, input.email);
  if (!last || !account)
    throw new Error('đăng ký xong mà thiếu thư hoặc tài khoản');
  return {
    email: input.email,
    id: result.maXacThucId,
    code: readOtpFromMail(last),
    taiKhoanId: account.taiKhoanId,
  };
}

export const verifyBody = (
  registered: Pick<Registered, 'email' | 'id' | 'code'>,
  overrides: Partial<VerifyRegistrationInput> = {},
): VerifyRegistrationInput => ({
  email: registered.email,
  maXacThucId: registered.id,
  otp: registered.code,
  ...overrides,
});

export const resendBody = (
  registered: Pick<Registered, 'email' | 'id'>,
  overrides: Partial<ResendRegistrationInput> = {},
): ResendRegistrationInput => ({
  email: registered.email,
  maXacThucId: registered.id,
  ...overrides,
});

/** Thao tác phải bị từ chối bằng AppException đúng trạng thái HTTP và mã lỗi; trả lại ngoại lệ để kiểm thêm. */
export async function expectRefused(
  operation: Promise<unknown>,
  status: number,
  maLoi: string,
): Promise<AppException> {
  const error = await appExceptionOf(operation);
  expect({ status: error.getStatus(), maLoi: error.maLoi }).toEqual({
    status,
    maLoi,
  });
  return error;
}

export const patientRows = (db: DataSource): Promise<BenhNhan[]> =>
  db.getRepository(BenhNhan).find({ order: { taiKhoanId: 'ASC' } });

export const walletRows = (db: DataSource): Promise<ViNoiBo[]> =>
  db.getRepository(ViNoiBo).find({ order: { viNoiBoId: 'ASC' } });

export const sessionCount = (db: DataSource): Promise<number> =>
  db.getRepository(PhienDangNhap).count();

/** Toàn bộ dữ liệu liên quan tới đăng ký: so trước/sau để chứng minh một thao tác bị từ chối KHÔNG ghi gì (hoặc đã hoàn tác trọn). */
export async function snapshotOf(db: DataSource) {
  return {
    accounts: await allAccounts(db),
    otpRows: await allOtpRows(db),
    patients: await patientRows(db),
    wallets: await walletRows(db),
    sessions: await sessionCount(db),
  };
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Lời hứa mở bằng tay: để test dựng đúng thứ tự "A giữ khoá rồi dừng, B chạy chồng lên, A làm tiếp" bằng chờ thật. */
export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * Bộ đếm `lock_deadlocks` của InnoDB toàn máy chủ (bắt cả deadlock mà bên gọi bắt rồi thử lại nên không thành lỗi ở phía gọi).
 * Bật nếu máy chủ đang tắt: chỉ là bộ đếm, không đổi hành vi khoá.
 */
export async function serverDeadlocks(db: DataSource): Promise<number> {
  await db.query("SET GLOBAL innodb_monitor_enable = 'lock_deadlocks'");
  const rows: { COUNT: string }[] = await db.query(
    "SELECT `COUNT` FROM information_schema.INNODB_METRICS WHERE NAME = 'lock_deadlocks'",
  );
  return Number(rows[0]?.COUNT);
}
