import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../../auth/entities/enums.js';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import type { KhoaNoShowFilter } from './account.dto.js';
import { ACCOUNT_FROM_SQL, type SqlCondition } from './account-visibility.js';
import type { AccountRow, ActivationLinkFacts } from './account-view.js';

/** Bộ lọc của người dùng (chi nhánh nằm trong `SqlCondition` của phạm vi, không ở đây). */
export interface AccountFilters {
  vaiTro?: readonly LoaiTaiKhoan[];
  trangThai?: TrangThaiTaiKhoan;
  khoaNoShow?: KhoaNoShowFilter;
  q?: string;
}

export interface AccountPage {
  rows: AccountRow[];
  total: number;
}

export interface AccountDetailRead {
  row: AccountRow;
  /** Liên kết kích hoạt đang hiệu lực; chỉ đọc cho nhân sự `ChoKichHoat`. */
  activationLink: ActivationLinkFacts | null;
}

// Sắp xếp CỐ ĐỊNH: `tai_khoan_id` là khoá phụ để các dòng trùng họ tên không đổi chỗ giữa hai lần gọi (phân trang ổn định).
export const ACCOUNT_ORDER_BY = 't.ho_ten ASC, t.tai_khoan_id ASC';

// Chỉ liệt kê cột được phép đọc. KHÔNG `SELECT *`, không đụng mat_khau_bam, ma_xac_thuc, phien_dang_nhap, vi_noi_bo.
// Khớp từng khoá với ACCOUNT_ROW_KEYS.
export const ACCOUNT_COLUMNS = `
  CAST(t.tai_khoan_id AS CHAR) AS taiKhoanId,
  t.loai_tai_khoan AS loaiTaiKhoan,
  t.ho_ten AS hoTen,
  t.email AS email,
  t.so_dien_thoai AS soDienThoai,
  DATE_FORMAT(t.ngay_sinh, '%Y-%m-%d') AS ngaySinh,
  t.gioi_tinh AS gioiTinh,
  t.dia_chi AS diaChi,
  t.trang_thai AS trangThai,
  t.da_xac_minh_email AS daXacMinhEmail,
  t.thoi_diem_tao AS thoiDiemTao,
  bn.khoa_dat_lich_do_no_show AS khoaDatLichDoNoShow,
  bn.so_lan_no_show AS soLanNoShow,
  qv.pham_vi_quan_tri AS phamViQuanTri,
  CAST(cn.chi_nhanh_id AS CHAR) AS chiNhanhId,
  cn.ten AS chiNhanhTen`;

export type NamedParameters = Record<string, unknown>;

// TypeORM đổi `:tên` (và `:...tên` cho mảng) thành `?`, vì `patientVisibilityFilter` của C1 trả tham số có tên.
function bind(
  manager: EntityManager,
  sql: string,
  parameters: NamedParameters,
): [string, unknown[]] {
  return manager.connection.driver.escapeQueryWithParameters(
    sql,
    parameters,
  ) as [string, unknown[]];
}

// MỘT hàm dựng điều kiện cho cả SELECT lẫn COUNT: `total` không thể lệch khỏi `items`.
export function buildWhere(
  visibility: SqlCondition,
  filters: AccountFilters,
): { where: string; parameters: NamedParameters } {
  const conditions = [visibility.sql];
  const parameters: NamedParameters = { ...visibility.parameters };
  if (filters.vaiTro !== undefined) {
    conditions.push('t.loai_tai_khoan IN (:...vaiTro)');
    parameters.vaiTro = [...filters.vaiTro];
  }
  if (filters.trangThai !== undefined) {
    conditions.push('t.trang_thai = :trangThai');
    parameters.trangThai = filters.trangThai;
  }
  if (filters.khoaNoShow !== undefined) {
    // Nhân sự và Bệnh nhân chưa có dòng benh_nhan có cờ NULL nên không khớp `true` lẫn `false`.
    conditions.push('bn.khoa_dat_lich_do_no_show = :khoaNoShow');
    parameters.khoaNoShow = filters.khoaNoShow === 'true' ? 1 : 0;
  }
  if (filters.q) {
    conditions.push(
      "(t.ho_ten LIKE :pattern ESCAPE '!' OR t.email LIKE :pattern ESCAPE '!' OR t.so_dien_thoai LIKE :pattern ESCAPE '!')",
    );
    parameters.pattern = `%${escapeLikePattern(filters.q)}%`;
  }
  return { where: conditions.join(' AND '), parameters };
}

@Injectable()
export class AccountRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async list(
    visibility: SqlCondition,
    filters: AccountFilters,
    limit: number,
    offset: number,
  ): Promise<AccountPage> {
    const { where, parameters } = buildWhere(visibility, filters);
    // Hai câu cùng một ảnh chụp, để `total` khớp `items` kể cả khi có ghi xen vào.
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const [selectSql, selectValues] = bind(
        manager,
        `SELECT ${ACCOUNT_COLUMNS} FROM ${ACCOUNT_FROM_SQL} WHERE ${where} ORDER BY ${ACCOUNT_ORDER_BY} LIMIT :limit OFFSET :offset`,
        { ...parameters, limit, offset },
      );
      const rows: AccountRow[] = await manager.query(selectSql, selectValues);
      const [countSql, countValues] = bind(
        manager,
        `SELECT COUNT(*) AS total FROM ${ACCOUNT_FROM_SQL} WHERE ${where}`,
        parameters,
      );
      const counts: { total: string | number }[] = await manager.query(
        countSql,
        countValues,
      );
      return { rows, total: Number(counts[0]!.total) };
    });
  }

  // Một truy vấn có điều kiện phạm vi ngay trong WHERE: id không tồn tại và id ngoài tầm nhìn cùng trả null (không có hai đường mã).
  async get(
    visibility: SqlCondition,
    id: string,
  ): Promise<AccountDetailRead | null> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const [sql, values] = bind(
        manager,
        `SELECT ${ACCOUNT_COLUMNS} FROM ${ACCOUNT_FROM_SQL} WHERE t.tai_khoan_id = :id AND ${visibility.sql}`,
        { ...visibility.parameters, id },
      );
      const rows: AccountRow[] = await manager.query(sql, values);
      const row = rows[0];
      if (!row) return null;
      const awaitingActivation =
        row.loaiTaiKhoan !== 'BenhNhan' && row.trangThai === 'ChoKichHoat';
      return {
        row,
        activationLink: awaitingActivation
          ? await this.findActivationLink(manager, id)
          : null,
      };
    });
  }

  // Cột sinh `kich_hoat_dang_hieu_luc` = tai_khoan_id khi liên kết đã gửi, chưa thu hồi, chưa dùng (UNIQUE: tối đa MỘT hàng).
  // Chỉ chọn bốn cột thời điểm: không id mã xác thực, không `ma_bam`.
  private async findActivationLink(
    manager: EntityManager,
    id: string,
  ): Promise<ActivationLinkFacts | null> {
    const rows: ActivationLinkFacts[] = await manager.query(
      `SELECT het_han_luc AS hetHanLuc, da_gui_luc AS daGuiLuc, thu_hoi_luc AS thuHoiLuc, da_dung_luc AS daDungLuc
       FROM ma_xac_thuc WHERE kich_hoat_dang_hieu_luc = ?`,
      [id],
    );
    return rows[0] ?? null;
  }
}
