// Hạ tầng dùng chung cho test TÍCH HỢP và ĐUA của tạo tài khoản nhân sự (task B15, MySQL thật). Chỉ dùng trong test (thư mục testing/ không vào bản build).
// Dựng DỊCH VỤ THẬT (kho thật, ActivationLinkService thật, AuditService thật, UnverifiedPatientCleaner thật), chỉ thay MailService bằng thư giả.
import type { DataSource } from 'typeorm';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import { MaXacThuc } from '../../../auth/entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { MaXacThucRepository } from '../../../auth/repositories/ma-xac-thuc.repository.js';
import { PhienDangNhapRepository } from '../../../auth/repositories/phien-dang-nhap.repository.js';
import { TaiKhoanRepository } from '../../../auth/repositories/tai-khoan.repository.js';
import { UnverifiedPatientCleaner } from '../../../auth/register/unverified-patient-cleaner.js';
import { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import { MailService } from '../../../mail/mail.service.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { ChiNhanh } from '../../entities/chi-nhanh.entity.js';
import type { ChuyenKhoa } from '../../entities/chuyen-khoa.entity.js';
import type { DichVuKham } from '../../entities/dich-vu-kham.entity.js';
import { ChiNhanhDichVuKham } from '../../entities/chi-nhanh-dich-vu-kham.entity.js';
import { NhatKyHanhDong } from '../../entities/nhat-ky-hanh-dong.entity.js';
import {
  createActivationFixture,
  type ActivationFixture,
} from '../../staff-activation/testing/activation-link-fixtures.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { StaffAccountRepository } from '../staff-account.repository.js';
import { StaffAccountService } from '../staff-account.service.js';
import type {
  CreateStaffAccountResponse,
  StaffAccountInput,
} from '../staff-account.types.js';

export const SYSTEM_SCOPE: AdminScope = { kind: 'ToanHeThong' };

export interface StaffAccountWorld<TMail extends MailService> {
  db: DataSource;
  mail: TMail;
  /** Dịch vụ cấp liên kết thật dùng chung với `service` (cùng thư giả, cấu hình TTL 24 giờ) */
  links: ActivationFixture<TMail>;
  audit: AuditService;
  cleaner: UnverifiedPatientCleaner;
  policy: BranchAccessPolicy;
  service: StaffAccountService;
  fx: AdminFixtures;
  /** Chi nhánh chính, có dịch vụ `catalogService` */
  branch: ChiNhanh;
  otherBranch: ChiNhanh;
  specialty: ChuyenKhoa;
  catalogService: DichVuKham;
  /** Quản trị viên Toàn hệ thống làm người thực hiện (actorId của audit) */
  actor: TaiKhoan;
  branchScope: AdminScope;
}

/** Ghép dịch vụ thật; `overrides` thay MỘT phần để bơm lỗi (kho, liên kết, audit) mà các phần khác vẫn thật. */
export interface ServiceParts {
  repo?: StaffAccountRepository;
  links?: ActivationFixture<MailService>['service'];
  audit?: AuditService;
}

export function buildService(
  world: Pick<
    StaffAccountWorld<MailService>,
    'links' | 'audit' | 'policy' | 'cleaner'
  >,
  parts: ServiceParts = {},
): StaffAccountService {
  return new StaffAccountService(
    parts.links ?? world.links.service,
    parts.repo ?? new StaffAccountRepository(),
    parts.audit ?? world.audit,
    world.policy,
    world.cleaner,
  );
}

export async function createStaffAccountWorld<TMail extends MailService>(
  db: DataSource,
  mail: TMail,
): Promise<StaffAccountWorld<TMail>> {
  const links = createActivationFixture(db, mail);
  const audit = new AuditService(new AuditRepository());
  const cleaner = new UnverifiedPatientCleaner(
    new TaiKhoanRepository(),
    new MaXacThucRepository(),
    new PhienDangNhapRepository(db),
  );
  const policy = new BranchAccessPolicy();
  const fx = new AdminFixtures(db);
  const branch = await fx.branch();
  const otherBranch = await fx.branch();
  const { specialty, service } = await fx.catalog();
  await db.getRepository(ChiNhanhDichVuKham).save({
    chiNhanhId: branch.chiNhanhId,
    dichVuKhamId: service.dichVuKhamId,
  });
  const { account: actor } = await fx.admin();
  const world = { links, audit, policy, cleaner };
  return {
    db,
    mail,
    links,
    audit,
    cleaner,
    policy,
    service: buildService(world),
    fx,
    branch,
    otherBranch,
    specialty,
    catalogService: service,
    actor,
    branchScope: { kind: 'ChiNhanh', chiNhanhId: branch.chiNhanhId },
  };
}

export const createWorld = (
  db: DataSource,
): Promise<StaffAccountWorld<FakeMailService>> =>
  createStaffAccountWorld(db, new FakeMailService());

let sequence = 0;
/** Email hợp lệ, khác nhau mỗi lần gọi (đã ở dạng chuẩn hoá). */
export const newEmail = (label = 'nv'): string => {
  sequence += 1;
  return `${label}.${String(sequence)}@example.com`;
};

const person = (email = newEmail()) => ({
  hoTen: 'Phạm Thị Lan',
  email,
  soDienThoai: '0987654321',
});

type Overrides<T extends StaffAccountInput['vaiTro']> = Partial<
  Extract<StaffAccountInput, { vaiTro: T }>
>;

export function doctorInput(
  world: Pick<
    StaffAccountWorld<MailService>,
    'branch' | 'specialty' | 'catalogService'
  >,
  overrides: Overrides<'BacSi'> = {},
): StaffAccountInput {
  return {
    ...person(),
    vaiTro: 'BacSi',
    chiNhanhId: world.branch.chiNhanhId,
    chuyenKhoaId: world.specialty.chuyenKhoaId,
    dichVuKhamId: world.catalogService.dichVuKhamId,
    chucDanh: 'BS_CKI',
    hocVi: 'BS',
    soNamKinhNghiem: 10,
    ...overrides,
  };
}

export function receptionistInput(
  world: Pick<StaffAccountWorld<MailService>, 'branch'>,
  overrides: Overrides<'LeTan'> = {},
): StaffAccountInput {
  return {
    ...person(),
    vaiTro: 'LeTan',
    chiNhanhId: world.branch.chiNhanhId,
    ...overrides,
  };
}

export function systemAdminInput(email = newEmail()): StaffAccountInput {
  return { ...person(email), vaiTro: 'QuanTriVien', phamVi: 'ToanHeThong' };
}

export function branchAdminInput(
  world: Pick<StaffAccountWorld<MailService>, 'branch'>,
  email = newEmail(),
): StaffAccountInput {
  return {
    ...person(email),
    vaiTro: 'QuanTriVien',
    phamVi: 'ChiNhanh',
    chiNhanhId: world.branch.chiNhanhId,
  };
}

/** Gọi `create` với người thực hiện là Quản trị viên của thế giới thử. */
export const createAs = (
  world: Pick<StaffAccountWorld<MailService>, 'service' | 'actor'>,
  scope: AdminScope,
  input: StaffAccountInput,
): Promise<CreateStaffAccountResponse> =>
  world.service.create(scope, world.actor.taiKhoanId, input);

export interface RowCounts {
  taiKhoan: number;
  bacSi: number;
  leTan: number;
  quanTriVien: number;
  maXacThuc: number;
  nhatKy: number;
}

const countOf = async (db: DataSource, table: string): Promise<number> => {
  const rows: { n: string }[] = await db.query(
    `SELECT COUNT(*) AS n FROM ${table}`,
  );
  return Number(rows[0]?.n);
};

/** Số hàng của mọi bảng mà tạo tài khoản có thể ghi: so TRƯỚC và SAU để chứng minh "không tạo gì". */
export async function rowCounts(db: DataSource): Promise<RowCounts> {
  return {
    taiKhoan: await countOf(db, 'tai_khoan'),
    bacSi: await countOf(db, 'bac_si'),
    leTan: await countOf(db, 'le_tan'),
    quanTriVien: await countOf(db, 'quan_tri_vien'),
    maXacThuc: await countOf(db, 'ma_xac_thuc'),
    nhatKy: await countOf(db, 'nhat_ky_hanh_dong'),
  };
}

export const accountOf = (
  db: DataSource,
  taiKhoanId: string,
): Promise<TaiKhoan> =>
  db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId });

export const accountByEmail = (
  db: DataSource,
  email: string,
): Promise<TaiKhoan | null> => db.getRepository(TaiKhoan).findOneBy({ email });

export const linksOf = (
  db: DataSource,
  taiKhoanId: string,
): Promise<MaXacThuc[]> =>
  db.getRepository(MaXacThuc).find({
    where: { taiKhoanId },
    order: { maXacThucId: 'ASC' },
  });

export const auditRowsOf = (
  db: DataSource,
  maDoiTuong: string,
): Promise<NhatKyHanhDong[]> =>
  db.getRepository(NhatKyHanhDong).find({ where: { maDoiTuong } });

/** Bản chụp MỌI cột của hàng tài khoản (dạng chuỗi JSON) để so "giữ NGUYÊN từng cột". */
export async function accountSnapshot(
  db: DataSource,
  taiKhoanId: string,
): Promise<string> {
  const rows: unknown[] = await db.query(
    'SELECT * FROM tai_khoan WHERE tai_khoan_id = ?',
    [taiKhoanId],
  );
  return JSON.stringify(rows);
}

/** Toàn bộ nội dung văn bản của các bảng ghi dấu vết (để quét "không có token, băm, email, mật khẩu"). */
export async function dumpTraceTables(db: DataSource): Promise<string> {
  const parts: string[] = [];
  for (const table of ['tai_khoan', 'ma_xac_thuc', 'nhat_ky_hanh_dong']) {
    const rows: unknown[] = await db.query(`SELECT * FROM ${table}`);
    parts.push(JSON.stringify(rows));
  }
  return parts.join('\n');
}
