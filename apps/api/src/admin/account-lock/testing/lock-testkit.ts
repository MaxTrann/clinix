import type { DataSource } from 'typeorm';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import type { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { insertPhienDangNhap } from '../../../auth/entities/testing/auth-fixtures.js';
import { PhienDangNhapRepository } from '../../../auth/repositories/phien-dang-nhap.repository.js';
import { SessionService } from '../../../auth/session/session.service.js';
import { TokenService } from '../../../auth/session/token.service.js';
import { createTestConfigService } from '../../../auth/testing/auth-test-config.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { AccountLockRepository } from '../account-lock.repository.js';
import { AccountLockService } from '../account-lock.service.js';

/** Dịch vụ B18 dựng từ các lớp THẬT (MySQL thật, SessionService thật, AuditService thật); `repository` có thể là bản bọc của test. */
export function buildLockServices(
  db: DataSource,
  repository: AccountLockRepository = new AccountLockRepository(db),
) {
  const sessions = new SessionService(
    new PhienDangNhapRepository(db),
    new TokenService(createTestConfigService()),
  );
  const audit = new AuditService(new AuditRepository());
  const service = new AccountLockService(
    repository,
    new BranchAccessPolicy(),
    sessions,
    audit,
  );
  return { service, sessions, audit, repository };
}

/** Ảnh chụp mọi bảng mà khoá / mở khoá có thể đụng: so trước và sau để chứng minh "không đổi gì". */
export async function snapshot(db: DataSource): Promise<string> {
  const tables = [
    'tai_khoan',
    'benh_nhan',
    'bac_si',
    'le_tan',
    'quan_tri_vien',
    'lich_hen',
    'lich_lam_viec',
    'khung_gio',
    'ma_xac_thuc',
    'phien_dang_nhap',
    'nhat_ky_hanh_dong',
  ];
  const result: Record<string, unknown> = {};
  for (const table of tables)
    result[table] = await db.query(`SELECT * FROM \`${table}\` ORDER BY 1`);
  return JSON.stringify(result);
}

export interface AccountState {
  trang_thai: string;
  so_lan_dang_nhap_sai: number;
  khoa_dang_nhap_den: Date | null;
}

export async function stateOf(
  db: DataSource,
  id: string,
): Promise<AccountState> {
  const rows: AccountState[] = await db.query(
    'SELECT trang_thai, so_lan_dang_nhap_sai, khoa_dang_nhap_den FROM tai_khoan WHERE tai_khoan_id = ?',
    [id],
  );
  return rows[0]!;
}

export async function setState(
  db: DataSource,
  id: string,
  values: {
    trangThai?: string;
    soLanDangNhapSai?: number;
    khoaDangNhapDen?: Date | null;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (values.trangThai !== undefined) {
    sets.push('trang_thai = ?');
    params.push(values.trangThai);
    // CHECK chk_tai_khoan_mat_khau: ChoKichHoat ⇒ mật khẩu NULL; DangHoatDong ⇒ có mật khẩu (băm giả, không phải bí mật thật).
    if (values.trangThai === 'ChoKichHoat') sets.push('mat_khau_bam = NULL');
    if (values.trangThai === 'DangHoatDong') {
      sets.push('mat_khau_bam = COALESCE(mat_khau_bam, ?)');
      params.push('$argon2id$v=19$m=19456,t=2,p=1$BAMGIA$digest');
    }
  }
  if (values.soLanDangNhapSai !== undefined) {
    sets.push('so_lan_dang_nhap_sai = ?');
    params.push(values.soLanDangNhapSai);
  }
  if (values.khoaDangNhapDen !== undefined) {
    sets.push('khoa_dang_nhap_den = ?');
    params.push(values.khoaDangNhapDen);
  }
  await db.query(
    `UPDATE tai_khoan SET ${sets.join(', ')} WHERE tai_khoan_id = ?`,
    [...params, id],
  );
}

export interface SessionRow {
  id: string;
  revoked: Date | null;
}

export const sessionsOf = (
  db: DataSource,
  accountId: string,
): Promise<SessionRow[]> =>
  db.query(
    'SELECT CAST(phien_dang_nhap_id AS CHAR) AS id, thu_hoi_luc AS revoked FROM phien_dang_nhap WHERE tai_khoan_id = ? ORDER BY phien_dang_nhap_id',
    [accountId],
  );

export interface AuditRow {
  actor: string;
  branch: string | null;
  action: string;
  targetType: string;
  targetId: string;
  result: string;
  changes: unknown;
}

export const auditRows = (db: DataSource): Promise<AuditRow[]> =>
  db.query(
    `SELECT CAST(tai_khoan_id AS CHAR) AS actor, CAST(chi_nhanh_id AS CHAR) AS branch, hanh_dong AS action,
            loai_doi_tuong AS targetType, CAST(ma_doi_tuong AS CHAR) AS targetId, ket_qua AS result,
            chi_tiet_thay_doi AS changes
     FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id`,
  );

/** Thêm `count` phiên CHƯA thu hồi (còn hạn) cho tài khoản. */
export async function addActiveSessions(
  db: DataSource,
  accountId: string,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1)
    await insertPhienDangNhap(db, accountId);
}

/** Thêm một Quản trị viên Toàn hệ thống nữa (mặc định đang hoạt động), kèm một phiên. */
export async function addSystemAdmin(
  db: DataSource,
  trangThai: TaiKhoan['trangThai'] = 'DangHoatDong',
  label = 'Admin Toàn hệ thống thêm',
) {
  const made = await new AdminFixtures(db).admin(undefined, {
    hoTen: label,
    trangThai,
  });
  await insertPhienDangNhap(db, made.account.taiKhoanId);
  return made;
}

/** Lỗi deadlock giả có dạng mà `isDeadlockError` nhận ra. */
export const fakeDeadlock = (): Error =>
  Object.assign(new Error('deadlock giả'), {
    errno: 1213,
    code: 'ER_LOCK_DEADLOCK',
  });

/** Chờ một lời hứa nhưng KHÔNG để nó làm hỏng test: trả lỗi thay vì ném (dùng cho ca kiểm "đúng mã lỗi nào"). */
export async function outcomeOf<T>(
  work: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  return work.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}
