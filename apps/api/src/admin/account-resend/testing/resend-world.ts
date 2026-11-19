// Hạ tầng dùng chung cho test TÍCH HỢP và ĐUA của "Gửi lại liên kết kích hoạt" (task B20, MySQL thật). Chỉ dùng trong test (thư mục testing/ không vào bản build).
// Dựng DỊCH VỤ THẬT (kho thật, ActivationLinkService thật của B14, chính sách phạm vi thật), chỉ thay MailService bằng thư giả.
import type { DataSource } from 'typeorm';
import type { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import type { EnvironmentVariables } from '../../../config/env.validation.js';
import type { ChiNhanh } from '../../entities/chi-nhanh.entity.js';
import type { MailMessage } from '../../../mail/mail.service.js';
import { MailService } from '../../../mail/mail.service.js';
import { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import {
  createActivationFixture,
  type ActivationFixture,
} from '../../staff-activation/testing/activation-link-fixtures.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { AccountResendRepository } from '../account-resend.repository.js';
import { AccountResendService } from '../account-resend.service.js';

export const SYSTEM_SCOPE: AdminScope = { kind: 'ToanHeThong' };

/** Cột của nhân sự vừa được Admin tạo, đang chờ kích hoạt (CHECK `chk_tai_khoan_mat_khau`: ChoKichHoat thì không có mật khẩu). */
export const PENDING = {
  trangThai: 'ChoKichHoat',
  matKhauBam: null,
  daXacMinhEmail: false,
} as const satisfies Partial<TaiKhoan>;

export interface ResendWorld<TMail extends MailService> {
  db: DataSource;
  mail: TMail;
  /** Dịch vụ cấp liên kết thật (B14) dùng chung với `service`: cùng thư giả, cấu hình mặc định (TTL 24 giờ, 60 giây, 5 lần/giờ). */
  links: ActivationFixture<TMail>;
  policy: BranchAccessPolicy;
  service: AccountResendService;
  fx: AdminFixtures;
  branchA: ChiNhanh;
  branchB: ChiNhanh;
  scopeA: AdminScope;
  scopeB: AdminScope;
}

/** Ghép dịch vụ B20 thật quanh MỘT bộ liên kết (đổi bộ liên kết để thử cấu hình khác, ví dụ TTL hay giới hạn). */
export function resendServiceFor(
  links: ActivationFixture<MailService>,
  policy: BranchAccessPolicy = new BranchAccessPolicy(),
): AccountResendService {
  return new AccountResendService(
    links.service,
    new AccountResendRepository(),
    policy,
  );
}

export async function createResendWorld<TMail extends MailService>(
  db: DataSource,
  mail: TMail,
  overrides?: Partial<Record<keyof EnvironmentVariables, unknown>>,
): Promise<ResendWorld<TMail>> {
  const links = createActivationFixture(db, mail, overrides);
  const policy = new BranchAccessPolicy();
  const fx = new AdminFixtures(db);
  const branchA = await fx.branch({ ten: 'Chi nhánh A' });
  const branchB = await fx.branch({ ten: 'Chi nhánh B' });
  return {
    db,
    mail,
    links,
    policy,
    service: resendServiceFor(links, policy),
    fx,
    branchA,
    branchB,
    scopeA: { kind: 'ChiNhanh', chiNhanhId: branchA.chiNhanhId },
    scopeB: { kind: 'ChiNhanh', chiNhanhId: branchB.chiNhanhId },
  };
}

export const createWorld = (
  db: DataSource,
): Promise<ResendWorld<FakeMailService>> =>
  createResendWorld(db, new FakeMailService());

// Ba loại nhân sự CÓ hồ sơ vai trò (Chi nhánh cần hồ sơ để thấy được đích). Mọi tài khoản ở trạng thái chờ kích hoạt, chưa có hàng liên kết nào.
export const pendingDoctor = async (
  w: Pick<ResendWorld<MailService>, 'fx'>,
  branch: ChiNhanh,
  overrides: Partial<TaiKhoan> = {},
): Promise<TaiKhoan> =>
  (await w.fx.doctor(branch, {}, { ...PENDING, ...overrides })).account;

export const pendingReceptionist = async (
  w: Pick<ResendWorld<MailService>, 'fx'>,
  branch: ChiNhanh,
  overrides: Partial<TaiKhoan> = {},
): Promise<TaiKhoan> =>
  (await w.fx.receptionist(branch, { ...PENDING, ...overrides })).account;

/** Không truyền chi nhánh = Quản trị viên Toàn hệ thống; có chi nhánh = Quản trị viên Chi nhánh. */
export const pendingAdmin = async (
  w: Pick<ResendWorld<MailService>, 'fx'>,
  branch?: ChiNhanh,
  overrides: Partial<TaiKhoan> = {},
): Promise<TaiKhoan> =>
  (await w.fx.admin(branch, { ...PENDING, ...overrides })).account;

/** Các thư ĐÃ gửi thành công tới đúng email này. */
export const sentTo = (
  mail: { sent: readonly MailMessage[] },
  email: string,
): MailMessage[] => mail.sent.filter((message) => message.to === email);

/** Số dòng nhật ký hành động: B20 không ghi audit nên luôn 0 (PLAN 5.10 không có giá trị cho "gửi lại"). */
export async function auditRowCount(db: DataSource): Promise<number> {
  const rows: { total: string | number }[] = await db.query(
    'SELECT COUNT(*) AS total FROM nhat_ky_hanh_dong',
  );
  return Number(rows[0]?.total);
}
