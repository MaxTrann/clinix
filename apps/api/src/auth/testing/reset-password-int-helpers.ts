// Hạ tầng test tích hợp cho quên mật khẩu (2), đặt mật khẩu mới (task A12, MySQL thật). Dựng trên forgot-password-int-helpers của A11, nên dùng được
// với `measureRounds` của multi-account-helpers (fixture `MultiFixture` + `resetServicesFor`).
import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { MailService } from '../../mail/mail.service.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { ResetPasswordService } from '../forgot-password/reset-password.service.js';
import {
  createForgotFixture,
  forgotServicesFor,
  lastCode,
  type ForgotFixture,
  type ForgotServices,
} from './forgot-password-int-helpers.js';
import type { LoginFixture } from './login-int-helpers.js';
import { barrier } from './otp-multi-account.js';
import type { MailWithAttempts } from './verification-int-helpers.js';

/** Mật khẩu mới của test: chuỗi riêng để quét log/đáp ứng/DB xem có lọt ra ngoài không. Đạt Q11 (có số, có ký tự đặc biệt). */
export const NEW_PASSWORD = 'Mat-Khau-Moi-Dat-Lai-5!';

export interface ResetServices extends ForgotServices {
  reset: ResetPasswordService;
}

export interface ResetFixture<TMail extends MailService>
  extends ForgotFixture<TMail>, ResetServices {}

/** Dịch vụ quên mật khẩu (1) và (2) dựng trên một fixture đăng nhập có sẵn (cho `measureRounds`, nơi fixture do hạ tầng dựng). */
export function resetServicesFor(
  db: DataSource,
  fx: Pick<
    LoginFixture<MailService>,
    'accounts' | 'otp' | 'hasher' | 'sessionService'
  >,
): ResetServices {
  const forgot = forgotServicesFor(db, fx);
  return {
    ...forgot,
    reset: new ResetPasswordService(
      fx.accounts,
      fx.hasher,
      fx.otp,
      fx.sessionService,
      forgot.resetTokens,
    ),
  };
}

export function createResetFixture(
  db: DataSource,
): ResetFixture<FakeMailService>;
export function createResetFixture<TMail extends MailService>(
  db: DataSource,
  mail: TMail,
): ResetFixture<TMail>;
export function createResetFixture(
  db: DataSource,
  mail: MailService = new FakeMailService(),
): ResetFixture<MailService> {
  const base = createForgotFixture(db, mail);
  return { ...base, ...resetServicesFor(db, base) };
}

/** Bước 1 và 2 của Quên mật khẩu qua chính dịch vụ A11: cấp mã, đọc mã từ thư giả, xác minh ⇒ resetToken (hạn tính từ đồng hồ giả lúc gọi). */
export async function tokenFor(
  fx: Pick<ResetServices, 'forgot'> & { mail: MailWithAttempts },
  email: string,
): Promise<string> {
  await fx.forgot.requestCode(email);
  const code = lastCode(fx.mail);
  return (await fx.forgot.verifyCode(email, code)).resetToken;
}

export const resetInput = (
  resetToken: string,
  matKhauMoi: string = NEW_PASSWORD,
): { resetToken: string; matKhauMoi: string } => ({ resetToken, matKhauMoi });

/** Hàng tài khoản và các hàng OTP của nó: so trước/sau để chứng minh "không ghi gì" hoặc "đã hoàn tác trọn". */
export async function accountState(db: DataSource, taiKhoanId: string) {
  return {
    account: await db.getRepository(TaiKhoan).findOneBy({ taiKhoanId }),
    codes: await db
      .getRepository(MaXacThuc)
      .find({ where: { taiKhoanId }, order: { maXacThucId: 'ASC' } }),
  };
}

/**
 * Chạy mọi việc ĐỒNG THỜI qua một rào chắn; mỗi việc cho 'ok', mã lỗi nghiệp vụ (AppException), hoặc `LOI_LA: …` (lỗi ngoài dự kiến: test so mảng mã
 * sẽ đỏ, nên lỗi lạ không bao giờ bị coi như một từ chối nghiệp vụ).
 */
export async function together(
  works: (() => Promise<unknown>)[],
): Promise<string[]> {
  const gate = barrier(works.length);
  return Promise.all(
    works.map(async (work) => {
      await gate();
      try {
        await work();
        return 'ok';
      } catch (error) {
        return error instanceof AppException
          ? error.maLoi
          : `LOI_LA: ${String(error)}`;
      }
    }),
  );
}
