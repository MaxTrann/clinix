import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import type {
  HinhThucNghi,
  TrangThaiYeuCauNghiPhep,
} from '../entities/enums.js';

/** Bộ lọc đã chuẩn hoá. `chiNhanhId` đã qua `BranchAccessPolicy.branchFilter` (Admin Chi nhánh bị ép chi nhánh của mình). */
export interface AdminLeaveFilter {
  chiNhanhId?: string;
  bacSiId?: string;
  q?: string;
  /** `thoi_diem_tao >= from`; chuỗi 'YYYY-MM-DD HH:mm:ss' giờ VN */
  from?: string;
  /** `thoi_diem_tao < to` (nửa mở, không bọc DATE() để dùng được chỉ mục) */
  to?: string;
}

/** Một yêu cầu `DaDuyet` mà sweeper cần chạy lại (đủ để tìm lịch bị ảnh hưởng). */
export interface ApprovedLeaveRow {
  yeuCauNghiPhepId: string;
  bacSiId: string;
  tuNgay: string;
  denNgay: string;
  ca: CaLamViec | null;
}

export interface AdminLeaveRow {
  yeuCauNghiPhepId: string;
  trangThai: TrangThaiYeuCauNghiPhep;
  hinhThuc: HinhThucNghi;
  tuNgay: string;
  denNgay: string;
  ca: CaLamViec | null;
  lyDo: string;
  thoiDiemTao: Date;
  thoiDiemXuLy: Date | null;
  bacSiId: string;
  bacSiHoTen: string;
  chuyenKhoaTen: string;
  chiNhanhId: string;
  chiNhanhTen: string;
}

// Phạm vi theo chi nhánh HIỆN TẠI của bác sĩ (`bac_si.chi_nhanh_id`, Q28): bảng yêu cầu không có cột chi nhánh. Mọi JOIN qua khoá ngoại NOT NULL.
const FROM = `FROM yeu_cau_nghi_phep y
INNER JOIN bac_si b ON b.tai_khoan_id = y.bac_si_id
INNER JOIN tai_khoan t ON t.tai_khoan_id = b.tai_khoan_id
INNER JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = b.chuyen_khoa_id
INNER JOIN chi_nhanh cn ON cn.chi_nhanh_id = b.chi_nhanh_id`;

const COLUMNS = `CAST(y.yeu_cau_nghi_phep_id AS CHAR) AS yeuCauNghiPhepId, y.trang_thai AS trangThai, y.hinh_thuc_nghi AS hinhThuc,
  DATE_FORMAT(y.ngay_bat_dau, '%Y-%m-%d') AS tuNgay, DATE_FORMAT(y.ngay_ket_thuc, '%Y-%m-%d') AS denNgay,
  y.ca AS ca, y.ly_do AS lyDo, y.thoi_diem_tao AS thoiDiemTao, y.thoi_diem_xu_ly AS thoiDiemXuLy,
  CAST(b.tai_khoan_id AS CHAR) AS bacSiId, t.ho_ten AS bacSiHoTen, ck.ten AS chuyenKhoaTen,
  CAST(b.chi_nhanh_id AS CHAR) AS chiNhanhId, cn.ten AS chiNhanhTen`;

/** Điều kiện lọc (KHÔNG gồm trạng thái) + tham số. Mọi giá trị đi qua `?`. */
function filterConditions(filter: AdminLeaveFilter): {
  sql: string[];
  parameters: unknown[];
} {
  const sql: string[] = [];
  const parameters: unknown[] = [];
  if (filter.chiNhanhId !== undefined) {
    sql.push('b.chi_nhanh_id = ?');
    parameters.push(filter.chiNhanhId);
  }
  if (filter.bacSiId !== undefined) {
    sql.push('y.bac_si_id = ?');
    parameters.push(filter.bacSiId);
  }
  if (filter.q !== undefined) {
    const pattern = `%${escapeLikePattern(filter.q)}%`;
    sql.push("(t.ho_ten LIKE ? ESCAPE '!' OR ck.ten LIKE ? ESCAPE '!')");
    parameters.push(pattern, pattern);
  }
  if (filter.from !== undefined) {
    sql.push('y.thoi_diem_tao >= ?');
    parameters.push(filter.from);
  }
  if (filter.to !== undefined) {
    sql.push('y.thoi_diem_tao < ?');
    parameters.push(filter.to);
  }
  return { sql, parameters };
}

const where = (conditions: string[]) =>
  conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

/** SQL chỉ đọc của danh sách và chi tiết yêu cầu nghỉ (Quản trị viên). Người gọi truyền `em` của MỘT lần `runReadOnly` (cùng ảnh chụp). */
@Injectable()
export class AdminLeaveRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Mới nhất trước; id phá hoà cùng giây. SELECT và COUNT dùng CÙNG điều kiện, trước phân trang. */
  async findPage(
    em: EntityManager,
    filter: AdminLeaveFilter,
    trangThai: TrangThaiYeuCauNghiPhep | undefined,
    paging: { pageSize: number; offset: number },
  ): Promise<{ rows: AdminLeaveRow[]; total: number }> {
    const base = filterConditions(filter);
    const conditions = [...base.sql];
    const parameters = [...base.parameters];
    if (trangThai !== undefined) {
      conditions.push('y.trang_thai = ?');
      parameters.push(trangThai);
    }
    const rows: AdminLeaveRow[] = await em.query(
      `SELECT ${COLUMNS} ${FROM} ${where(conditions)}
        ORDER BY y.thoi_diem_tao DESC, y.yeu_cau_nghi_phep_id DESC LIMIT ? OFFSET ?`,
      [...parameters, paging.pageSize, paging.offset],
    );
    const counts: { so: string | number }[] = await em.query(
      `SELECT COUNT(*) AS so ${FROM} ${where(conditions)}`,
      parameters,
    );
    return { rows, total: Number(counts[0]?.so ?? 0) };
  }

  /** Số yêu cầu theo trạng thái với cùng bộ lọc, KHÔNG lọc trạng thái (PD-21). Trạng thái không có dòng nào vắng khỏi kết quả. */
  async countByStatus(
    em: EntityManager,
    filter: AdminLeaveFilter,
  ): Promise<Partial<Record<TrangThaiYeuCauNghiPhep, number>>> {
    const base = filterConditions(filter);
    const rows: { trangThai: TrangThaiYeuCauNghiPhep; so: string | number }[] =
      await em.query(
        `SELECT y.trang_thai AS trangThai, COUNT(*) AS so ${FROM} ${where(base.sql)} GROUP BY y.trang_thai`,
        base.parameters,
      );
    return Object.fromEntries(rows.map((r) => [r.trangThai, Number(r.so)]));
  }

  /**
   * Yêu cầu `DaDuyet` còn hiệu lực (`ngay_ket_thuc >= today`) cho sweeper, theo `yeu_cau_nghi_phep_id` tăng dần, sau con trỏ `after` (id của hàng cuối lô trước).
   * Con trỏ để yêu cầu nào cũng lỗi mãi không chặn các yêu cầu sau nó. Chỉ đọc, không khoá; cột DATE đọc bằng `DATE_FORMAT`; không có lý do nghỉ của Bác sĩ.
   */
  async findApprovedActive(
    em: EntityManager,
    input: { today: string; after: string | null; limit: number },
  ): Promise<ApprovedLeaveRow[]> {
    return em.query(
      `SELECT CAST(yeu_cau_nghi_phep_id AS CHAR) AS yeuCauNghiPhepId, CAST(bac_si_id AS CHAR) AS bacSiId,
              DATE_FORMAT(ngay_bat_dau, '%Y-%m-%d') AS tuNgay, DATE_FORMAT(ngay_ket_thuc, '%Y-%m-%d') AS denNgay, ca
         FROM yeu_cau_nghi_phep
        WHERE trang_thai = 'DaDuyet' AND ngay_ket_thuc >= ? AND yeu_cau_nghi_phep_id > ?
        ORDER BY yeu_cau_nghi_phep_id LIMIT ?`,
      [input.today, input.after ?? '0', input.limit],
    );
  }

  /** `EntityManager` tự commit, cho một câu đọc thường ngoài giao dịch (Duyệt đọc trước `bac_si_id` để biết khoá hàng nào). */
  manager(): EntityManager {
    return this.db.manager;
  }

  /** Giao dịch ghi `READ COMMITTED` tường minh như phân công, gỡ ca và tạo yêu cầu (Q40). */
  transaction<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction('READ COMMITTED', work);
  }

  /**
   * Khoá CHỈ hàng yêu cầu (PLAN 5.9: từ chối không xin `bac_si`). Trả trạng thái hiện tại, hoặc `null` nếu không có.
   * Hai Admin cùng từ chối: người sau chờ ở đây rồi thấy `TuChoi` (Q31).
   */
  async lockRequest(
    em: EntityManager,
    id: string,
  ): Promise<TrangThaiYeuCauNghiPhep | null> {
    const rows: { trangThai: TrangThaiYeuCauNghiPhep }[] = await em.query(
      `SELECT trang_thai AS trangThai FROM yeu_cau_nghi_phep WHERE yeu_cau_nghi_phep_id = ? FOR UPDATE`,
      [id],
    );
    return rows[0]?.trangThai ?? null;
  }

  /** Chỉ đổi khi còn `ChoDuyet` (lưới an toàn cùng CHECK `chk_nghi_phep_xu_ly`); trả số hàng đổi. */
  async markRejected(
    em: EntityManager,
    id: string,
    processedBy: string,
    processedAt: Date,
  ): Promise<number> {
    const result: { affectedRows: number } = await em.query(
      `UPDATE yeu_cau_nghi_phep
          SET trang_thai = 'TuChoi', nguoi_xu_ly_id = ?, thoi_diem_xu_ly = ?
        WHERE yeu_cau_nghi_phep_id = ? AND trang_thai = 'ChoDuyet'`,
      [processedBy, processedAt, id],
    );
    return result.affectedRows;
  }

  /**
   * Duyệt (B15) khoá `bac_si` TRƯỚC hàng yêu cầu (PLAN 5.9, tầng 4): đặt lịch xin `bac_si` FOR SHARE rồi kiểm nghỉ phép (D4), nên đặt lịch và duyệt
   * nối tiếp nhau (H6). Trả `false` nếu không có bác sĩ.
   */
  async lockDoctor(em: EntityManager, bacSiId: string): Promise<boolean> {
    const rows: unknown[] = await em.query(
      `SELECT tai_khoan_id FROM bac_si WHERE tai_khoan_id = ? FOR UPDATE`,
      [bacSiId],
    );
    return rows.length > 0;
  }

  /** Chỉ đổi khi còn `ChoDuyet` (cùng lưới an toàn với `markRejected`); trả số hàng đổi. */
  async markApproved(
    em: EntityManager,
    id: string,
    processedBy: string,
    processedAt: Date,
  ): Promise<number> {
    const result: { affectedRows: number } = await em.query(
      `UPDATE yeu_cau_nghi_phep
          SET trang_thai = 'DaDuyet', nguoi_xu_ly_id = ?, thoi_diem_xu_ly = ?
        WHERE yeu_cau_nghi_phep_id = ? AND trang_thai = 'ChoDuyet'`,
      [processedBy, processedAt, id],
    );
    return result.affectedRows;
  }

  /** Không lọc chi nhánh trong SQL: service lấy `chiNhanhId` từ DB rồi hỏi `BranchAccessPolicy` (đúng nếp admin). */
  async findOne(em: EntityManager, id: string): Promise<AdminLeaveRow | null> {
    const rows: AdminLeaveRow[] = await em.query(
      `SELECT ${COLUMNS} ${FROM} WHERE y.yeu_cau_nghi_phep_id = ?`,
      [id],
    );
    return rows[0] ?? null;
  }
}
