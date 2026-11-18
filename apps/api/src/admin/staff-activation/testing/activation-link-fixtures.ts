// Hạ tầng dùng chung cho test TÍCH HỢP của liên kết kích hoạt nhân sự (task B14, MySQL thật). Chỉ dùng trong test (thư mục testing/ không vào bản build).
import type { DataSource, EntityManager } from 'typeorm';
import { createTestConfigService } from '../../../auth/testing/auth-test-config.js';
import type { ConfigService } from '@nestjs/config';
import type { LoaiTaiKhoan } from '../../../auth/entities/enums.js';
import { MaXacThuc } from '../../../auth/entities/ma-xac-thuc.entity.js';
import type { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../../../auth/entities/testing/auth-fixtures.js';
import type { EnvironmentVariables } from '../../../config/env.validation.js';
import type { MailMessage } from '../../../mail/mail.service.js';
import { MailService } from '../../../mail/mail.service.js';
import { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import { ActivationLinkRepository } from '../activation-link.repository.js';
import { ActivationLinkService } from '../activation-link.service.js';
import type {
  ActivationLinkKind,
  ActivationRecipient,
  DeliverActivationLinkResult,
  IssueActivationLinkInput,
  StaffLoaiTaiKhoan,
} from '../activation-link.types.js';
import type { IssuedActivationLink } from '../issued-activation-link.js';

export interface ActivationFixture<TMail extends MailService> {
  repo: ActivationLinkRepository;
  mail: TMail;
  config: ConfigService<EnvironmentVariables, true>;
  service: ActivationLinkService;
}

export function createActivationFixture(
  db: DataSource,
): ActivationFixture<FakeMailService>;
export function createActivationFixture<TMail extends MailService>(
  db: DataSource,
  mail: TMail,
  overrides?: Partial<Record<keyof EnvironmentVariables, unknown>>,
): ActivationFixture<TMail>;
export function createActivationFixture(
  db: DataSource,
  mail: MailService = new FakeMailService(),
  overrides: Partial<Record<keyof EnvironmentVariables, unknown>> = {},
): ActivationFixture<MailService> {
  const repo = new ActivationLinkRepository();
  // Giá trị mặc định của ba biến STAFF_ACTIVATION_* (Q22, Q23); `overrides` để thử giá trị khác
  const config = createTestConfigService({
    STAFF_ACTIVATION_TTL_HOURS: 24,
    STAFF_ACTIVATION_RESEND_MIN_SECONDS: 60,
    STAFF_ACTIVATION_RESEND_MAX_PER_HOUR: 5,
    ...overrides,
  });
  return {
    repo,
    mail,
    config,
    service: new ActivationLinkService(db, repo, mail, config),
  };
}

/** Nhân sự đang chờ kích hoạt (không mật khẩu, chưa xác minh email): trạng thái của tài khoản vừa được Admin tạo. */
export function newPendingStaff(
  db: DataSource | EntityManager,
  loaiTaiKhoan: StaffLoaiTaiKhoan = 'LeTan',
  overrides: Partial<TaiKhoan> = {},
): Promise<TaiKhoan> {
  return insertTaiKhoan(db, {
    loaiTaiKhoan,
    trangThai: 'ChoKichHoat',
    matKhauBam: null,
    daXacMinhEmail: false,
    ...overrides,
  });
}

/** Tài khoản bất kỳ loại và trạng thái (cho ca từ chối: Bệnh nhân, đang hoạt động, đã ngưng). */
export function newAccount(
  db: DataSource,
  loaiTaiKhoan: LoaiTaiKhoan,
  trangThai: TaiKhoan['trangThai'],
): Promise<TaiKhoan> {
  return insertTaiKhoan(db, { loaiTaiKhoan, trangThai });
}

export const recipientOf = (account: TaiKhoan): ActivationRecipient => ({
  email: account.email,
  fullName: account.hoTen,
});

/** Mọi hàng KichHoatNhanSu của tài khoản, theo id tăng dần. */
export const linkRowsOf = (
  db: DataSource,
  taiKhoanId: string,
): Promise<MaXacThuc[]> =>
  db.getRepository(MaXacThuc).find({
    where: { taiKhoanId, loai: 'KichHoatNhanSu' },
    order: { maXacThucId: 'ASC' },
  });

export const linkRowOf = (db: DataSource, id: string): Promise<MaXacThuc> =>
  db.getRepository(MaXacThuc).findOneByOrFail({ maXacThucId: id });

/** Số hàng đang chiếm cột sinh UNIQUE `kich_hoat_dang_hieu_luc` (đã gửi, chưa thu hồi, chưa dùng) của tài khoản: luôn 0 hoặc 1. */
export async function occupiedSlotsOf(
  db: DataSource,
  taiKhoanId: string,
): Promise<number> {
  const rows: { n: string }[] = await db.query(
    "SELECT COUNT(*) AS n FROM ma_xac_thuc WHERE tai_khoan_id = ? AND loai = 'KichHoatNhanSu' AND kich_hoat_dang_hieu_luc IS NOT NULL",
    [taiKhoanId],
  );
  return Number(rows[0]?.n);
}

export interface ParsedActivationMail {
  url: string;
  id: string;
  token: string;
}

/** Đọc URL kích hoạt từ thư giống người nhận thật: cách DUY NHẤT test biết token. */
export function parseActivationMail(
  message: MailMessage | undefined,
): ParsedActivationMail {
  const match = /https?:\/\/\S+/.exec(message?.text ?? '');
  if (!match) throw new Error('không có URL kích hoạt trong thư');
  const url = new URL(match[0]);
  const params = new URLSearchParams(url.hash.slice(1));
  const id = params.get('id');
  const token = params.get('token');
  if (id === null || token === null) {
    throw new Error('URL kích hoạt thiếu id hoặc token');
  }
  return { url: match[0], id, token };
}

/** Pha 1 và bắt buộc thành công (dùng cho phần chuẩn bị của ca khác). */
export async function issueOk(
  service: ActivationLinkService,
  taiKhoanId: string,
  kind: ActivationLinkKind = 'GuiLai',
): Promise<IssuedActivationLink> {
  const input: IssueActivationLinkInput = { taiKhoanId, kind };
  const result = await service.issue(input);
  if (!result.ok) {
    throw new Error(`cấp liên kết thất bại: ${result.failure.reason}`);
  }
  return result.issued;
}

/** Cấp, gửi (thư giả) rồi trả kết quả; dùng khi ca chỉ cần "đã có một liên kết đã gửi". */
export async function issueAndDeliver(
  fx: ActivationFixture<MailService>,
  account: TaiKhoan,
  kind: ActivationLinkKind = 'GuiLai',
): Promise<{ id: string; result: DeliverActivationLinkResult }> {
  const issued = await issueOk(fx.service, account.taiKhoanId, kind);
  const result = await fx.service.deliver(issued, recipientOf(account));
  return { id: issued.maXacThucId, result };
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
