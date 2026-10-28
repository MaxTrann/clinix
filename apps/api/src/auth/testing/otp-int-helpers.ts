// Hạ tầng dùng chung cho test tích hợp của OtpService (task A2, MySQL thật) và cho test của A5, A6, A11 sau này.
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { MailService, type MailMessage } from '../../mail/mail.service.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { MaXacThuc } from '../entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../entities/testing/auth-fixtures.js';
import type { IssuedOtp } from '../otp/issued-otp.js';
import { OtpService } from '../otp/otp.service.js';
import type {
  IssueOtpInput,
  OtpLoai,
  Recipient,
  RegistrationData,
} from '../otp/otp.types.js';
import { MaXacThucRepository } from '../repositories/ma-xac-thuc.repository.js';
import { createTestConfigService } from './auth-test-config.js';
import { readOtpFromMail } from './otp-test-helpers.js';

/** 08:00:00 giờ Việt Nam, đúng giây. Chọn xa "bây giờ" thật để lẫn đồng hồ ứng dụng với NOW() của DB sẽ làm test đỏ. */
export const T0 = new Date('2026-11-02T01:00:00.000Z');
export const at = (seconds: number): Date =>
  new Date(T0.getTime() + seconds * 1000);

export const REGISTRATION: RegistrationData = {
  hoTen: 'Nguyễn Văn A',
  soDienThoai: '0901234567',
  matKhauBam: '$argon2id$v=19$m=19456,t=2,p=1$gia$gia',
};

/**
 * MailService giả cho phép GIỮ lại các lần gửi đang chạy để test xem DB ở GIỮA lúc gửi (N1: mã cũ chưa bị đụng trước khi gửi
 * thành công). Mặc định thư đi ngay; đặt `holding = true` thì mỗi `send` treo tới khi `releaseNext()` hoặc `failNext()`.
 */
export class ControlledMailService extends MailService {
  readonly attempts: MailMessage[] = [];
  readonly sent: MailMessage[] = [];
  holding = false;
  private readonly waiting: {
    message: MailMessage;
    resolve: () => void;
    reject: (error: Error) => void;
  }[] = [];

  send(message: MailMessage): Promise<void> {
    this.attempts.push(message);
    if (!this.holding) {
      this.sent.push(message);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.waiting.push({
        message,
        resolve: () => {
          this.sent.push(message);
          resolve();
        },
        reject,
      });
    });
  }

  /** Chờ tới khi có ít nhất `count` lần gửi đang bị giữ. */
  async waitForPending(count = 1): Promise<void> {
    for (let i = 0; i < 1000 && this.waiting.length < count; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (this.waiting.length < count) {
      throw new Error(
        `Chờ ${String(count)} lần gửi bị giữ nhưng chỉ có ${String(this.waiting.length)}`,
      );
    }
  }

  /** Cho lần gửi thứ `index` (0 = lâu nhất) đang bị giữ thành công. */
  release(index = 0): void {
    this.waiting.splice(index, 1)[0]?.resolve();
  }

  /** Cho lần gửi thứ `index` đang bị giữ thất bại. */
  fail(error: Error, index = 0): void {
    this.waiting.splice(index, 1)[0]?.reject(error);
  }
}

export interface OtpFixture<TMail extends MailService> {
  repo: MaXacThucRepository;
  mail: TMail;
  otp: OtpService;
}

export function createOtpFixture(db: DataSource): OtpFixture<FakeMailService>;
export function createOtpFixture<TMail extends MailService>(
  db: DataSource,
  mail: TMail,
): OtpFixture<TMail>;
export function createOtpFixture(
  db: DataSource,
  mail: MailService = new FakeMailService(),
): OtpFixture<MailService> {
  const repo = new MaXacThucRepository();
  return {
    repo,
    mail,
    otp: new OtpService(db, repo, mail, createTestConfigService()),
  };
}

/** Tài khoản Bệnh nhân chưa xác minh (trạng thái của người vừa đăng ký). */
export async function newUnverifiedAccount(
  db: DataSource,
  overrides: Partial<TaiKhoan> = {},
): Promise<TaiKhoan> {
  return insertTaiKhoan(db, { daXacMinhEmail: false, ...overrides });
}

export function recipientOf(account: TaiKhoan): Recipient {
  return { email: account.email, fullName: account.hoTen };
}

export const rowOf = (db: DataSource, id: string): Promise<MaXacThuc> =>
  db.getRepository(MaXacThuc).findOneByOrFail({ maXacThucId: id });

export const rowsOf = (
  db: DataSource,
  taiKhoanId: string,
): Promise<MaXacThuc[]> =>
  db.getRepository(MaXacThuc).find({
    where: { taiKhoanId },
    order: { maXacThucId: 'ASC' },
  });

/** Pha 1 và bắt buộc thành công (dùng cho phần chuẩn bị của ca khác). */
export async function issueOk(
  otp: OtpService,
  input: IssueOtpInput,
): Promise<IssuedOtp> {
  const result = await otp.issue(input);
  if (!result.ok) throw new Error(`cấp mã thất bại: ${result.failure.reason}`);
  return result.issued;
}

export const registerInput = (taiKhoanId: string): IssueOtpInput => ({
  taiKhoanId,
  loai: 'DangKy',
  registration: REGISTRATION,
});

export const forgotInput = (taiKhoanId: string): IssueOtpInput => ({
  taiKhoanId,
  loai: 'QuenMatKhau',
});

/** Cấp, gửi (thư giả nhận) và trả mã đọc từ thư — cách DUY NHẤT test biết mã, giống người dùng thật. */
export async function issueDeliverRead(
  fixture: OtpFixture<MailService & { attempts: MailMessage[] }>,
  account: TaiKhoan,
  loai: OtpLoai = 'DangKy',
): Promise<{ id: string; code: string }> {
  const issued = await issueOk(
    fixture.otp,
    loai === 'DangKy'
      ? registerInput(account.taiKhoanId)
      : forgotInput(account.taiKhoanId),
  );
  await fixture.otp.deliver(issued, recipientOf(account));
  const last = fixture.mail.attempts[fixture.mail.attempts.length - 1];
  if (!last) throw new Error('không có thư nào được gửi');
  return { id: issued.maXacThucId, code: readOtpFromMail(last) };
}

/** Sai một mã cho trước bằng cách đổi một chữ số. */
export function wrongCodeFor(code: string): string {
  return code.startsWith('0') ? `1${code.slice(1)}` : `0${code.slice(1)}`;
}

const describeArg = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value instanceof Error
      ? `${value.name}: ${value.message}\n${value.stack ?? ''}`
      : JSON.stringify(value);

/**
 * Bắt MỌI lời gọi Logger của Nest (log, warn, error, debug, verbose, fatal) của mã đang chạy, không in ra màn hình.
 * Trả mảng các dòng đã gom (mỗi lời gọi một phần tử, gồm mọi đối số). Gọi `vi.restoreAllMocks()` ở afterEach để trả lại.
 */
export function captureNestLogger(): string[] {
  const lines: string[] = [];
  const record = (message: unknown, ...rest: unknown[]): void => {
    lines.push([message, ...rest].map(describeArg).join(' '));
  };
  for (const level of [
    'log',
    'warn',
    'error',
    'debug',
    'verbose',
    'fatal',
  ] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation(record);
  }
  return lines;
}
