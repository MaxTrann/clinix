// Hạ tầng test tích hợp cho job dọn tài khoản chưa xác minh (task A7, MySQL thật). Dựng trên createVerificationFixture của A6.
import type { DataSource } from 'typeorm';
import { MailService } from '../../mail/mail.service.js';
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
import { UnverifiedPatientCleanupJob } from '../register/unverified-patient-cleanup.job.js';
import { at } from './otp-int-helpers.js';
import {
  createVerificationFixture,
  type VerificationFixture,
} from './verification-int-helpers.js';

/** 24 giờ tính bằng giây: `at(-(DAY + 60))` là tài khoản đã quá hạn 1 phút. */
export const DAY = UNVERIFIED_ACCOUNT_TTL_MS / 1000;

/** Trạng thái đọc từ DB của một tài khoản: dùng so sánh "đã xoá trọn" và "còn nguyên" mà không dựa vào giá trị trả về của job. */
export const GONE = '0 tài khoản, 0 OTP, 0 phiên';
export const INTACT = '1 tài khoản, 2 OTP, 1 phiên';

export interface CleanupFixture<
  TMail extends MailService,
> extends VerificationFixture<TMail> {
  job: UnverifiedPatientCleanupJob;
}

export function createCleanupFixture(
  db: DataSource,
): CleanupFixture<FakeMailService>;
export function createCleanupFixture<TMail extends MailService>(
  db: DataSource,
  mail: TMail,
): CleanupFixture<TMail>;
export function createCleanupFixture(
  db: DataSource,
  mail: MailService = new FakeMailService(),
): CleanupFixture<MailService> {
  const fx = createVerificationFixture(db, mail);
  return { ...fx, job: newJob(db, fx) };
}

/** Một "bản API" nữa chạy job trên cùng DB (cờ chống chạy chồng riêng: như tiến trình thứ hai). */
export function newJob(
  db: DataSource,
  fx: Pick<VerificationFixture<MailService>, 'accounts' | 'cleaner'>,
): UnverifiedPatientCleanupJob {
  return new UnverifiedPatientCleanupJob(db, fx.accounts, fx.cleaner);
}

/**
 * Bệnh nhân chưa xác minh tạo `ageSeconds` giây trước "bây giờ" (đồng hồ giả), kèm đủ hàng con mà việc xoá phải dọn theo thứ tự:
 * hai mã OTP (một `DangKy`, một `QuenMatKhau`) và một phiên. `overrides` đổi loại/trạng thái/cờ xác minh/email…
 */
export async function seedAccountWithChildren(
  db: DataSource,
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

export async function stateOf(db: DataSource, id: string): Promise<string> {
  const accounts = await db.getRepository(TaiKhoan).countBy({ taiKhoanId: id });
  const otps = await db.getRepository(MaXacThuc).countBy({ taiKhoanId: id });
  const sessions = await db
    .getRepository(PhienDangNhap)
    .countBy({ taiKhoanId: id });
  return `${String(accounts)} tài khoản, ${String(otps)} OTP, ${String(sessions)} phiên`;
}
