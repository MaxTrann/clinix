// Hạ tầng test tích hợp cho đăng nhập (task A8, MySQL thật). Dựng trên createVerificationFixture của A6.
import type { DataSource } from 'typeorm';
import { MailService } from '../../mail/mail.service.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../entities/testing/auth-fixtures.js';
import { LoginService } from '../login/login.service.js';
import { PasswordHasher } from '../password/password-hasher.service.js';
import { SessionService } from '../session/session.service.js';
import { TokenService } from '../session/token.service.js';
import { createTestConfigService } from './auth-test-config.js';
import {
  createVerificationFixture,
  type VerificationFixture,
} from './verification-int-helpers.js';

/** Mật khẩu "thật" của tài khoản đăng nhập trong test, và một mật khẩu sai: chuỗi riêng để quét log/đáp ứng/DB xem có lọt ra ngoài không. */
export const LOGIN_PASSWORD = 'Mat-Khau-Dang-Nhap-7!';
export const WRONG_PASSWORD = 'Mat-Khau-Sai-Khac-3#';

// Băm Argon2id thật MỘT lần cho cả file test (mỗi lần ~22 ms) rồi dùng lại cho mọi tài khoản mẫu
let sharedHash: Promise<string> | undefined;
export const loginPasswordHash = (): Promise<string> =>
  (sharedHash ??= new PasswordHasher().hash(LOGIN_PASSWORD));

export interface LoginFixture<
  TMail extends MailService,
> extends VerificationFixture<TMail> {
  tokens: TokenService;
  sessionService: SessionService;
  login: LoginService;
}

export function createLoginFixture(
  db: DataSource,
): LoginFixture<FakeMailService>;
export function createLoginFixture<TMail extends MailService>(
  db: DataSource,
  mail: TMail,
): LoginFixture<TMail>;
export function createLoginFixture(
  db: DataSource,
  mail: MailService = new FakeMailService(),
): LoginFixture<MailService> {
  const base = createVerificationFixture(db, mail);
  const tokens = new TokenService(createTestConfigService());
  const sessionService = new SessionService(base.sessions, tokens);
  return {
    ...base,
    tokens,
    sessionService,
    login: new LoginService(
      db,
      base.accounts,
      base.hasher,
      sessionService,
      base.otp,
    ),
  };
}

let sequence = 0;

/** Tài khoản đã xác minh, đang hoạt động, mật khẩu là LOGIN_PASSWORD (email khác nhau mỗi lần gọi). */
export async function newLoginAccount(
  db: DataSource,
  overrides: Partial<TaiKhoan> = {},
): Promise<TaiKhoan> {
  sequence += 1;
  return insertTaiKhoan(db, {
    email: `dang.nhap.${String(sequence)}@example.com`,
    matKhauBam: await loginPasswordHash(),
    daXacMinhEmail: true,
    thoiDiemTao: new Date(Date.now() - 3600_000),
    ...overrides,
  });
}

export const loginBody = (
  account: Pick<TaiKhoan, 'email'>,
  matKhau: string = LOGIN_PASSWORD,
): { email: string; matKhau: string } => ({ email: account.email, matKhau });

/** Bộ đếm và khoá đăng nhập hiện có trong DB của một tài khoản. */
export async function failureState(
  db: DataSource,
  taiKhoanId: string,
): Promise<{ soLanDangNhapSai: number; khoaDangNhapDen: Date | null }> {
  const row = await db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId });
  return {
    soLanDangNhapSai: row.soLanDangNhapSai,
    khoaDangNhapDen: row.khoaDangNhapDen,
  };
}

export const sessionRowsOf = (
  db: DataSource,
  taiKhoanId: string,
): Promise<PhienDangNhap[]> =>
  db.getRepository(PhienDangNhap).find({
    where: { taiKhoanId },
    order: { phienDangNhapId: 'ASC' },
  });

/** Đặt thẳng bộ đếm và khoá trong DB (dựng tình huống mà không phải đăng nhập sai nhiều lần). */
export const setFailureState = (
  db: DataSource,
  taiKhoanId: string,
  values: { soLanDangNhapSai: number; khoaDangNhapDen: Date | null },
): Promise<unknown> =>
  db.getRepository(TaiKhoan).update({ taiKhoanId }, values);
