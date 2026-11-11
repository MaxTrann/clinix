import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type {
  CaLamViec,
  MoiQuanHeNguoiThan,
} from '../../admin/entities/enums.js';
import {
  DOCTOR_VISIBLE_STATES,
  type DoctorVisibleState,
} from './doctor-appointments.dto.js';
import {
  addCommonFilters,
  addKeywordFilter,
  addStateFilter,
  fromWhere,
  ORDER_BY,
  queryStatusCounts,
  type KeywordTargets,
  type ListOrder,
  type SqlClauses,
} from './list-query.sql.js';

// SQL thô của danh sách và chi tiết lịch hẹn cho BÁC SĨ (task B5; PLAN booking 5.8; TRACKING 3.20 B5-D, B5-E). Chỉ ĐỌC. FROM, bộ lọc ngày, ô tìm, sắp xếp lấy từ `list-query.sql.ts` (dùng chung với
// B1, B3); file này chỉ có phần RIÊNG của Bác sĩ: điều kiện phạm vi, `ca`, cột trắng. Phạm vi `lh.bac_si_id = ?` là điều kiện ĐẦU của MỌI câu và nằm TRONG SQL (H10). Không ghi log: mã lịch, tên,
// SĐT, ngày sinh, lý do khám là dữ liệu cá nhân và y tế.

/** Bộ lọc của MỘT câu: `states` đã là tập cuối cùng (giao của sáu trạng thái hiển thị và `trangThai[]`); rỗng ⇒ không dòng nào. */
export interface DoctorAppointmentFilter {
  states: readonly DoctorVisibleState[];
  ca: CaLamViec | null;
  /** `thoi_gian >= from`; chuỗi `YYYY-MM-DD HH:mm:ss` giờ VN */
  from: string | null;
  /** `thoi_gian < to` */
  to: string | null;
  /** Từ khoá ĐÃ chuẩn hoá và hợp lệ (2 đến 100 ký tự) */
  keyword: string | null;
}

/**
 * Hàng thô của câu trang. `thoiGian` (DATETIME) ra `Date` nhờ múi giờ của driver. `quanHe` là `NULL` khi khám cho chính mình (LEFT JOIN hồ sơ không có hàng), mapper đổi thành `BanThan`.
 * `ngaySinh` đã `DATE_FORMAT` ở SQL nên là chuỗi `YYYY-MM-DD` (không phụ thuộc cách driver trả cột `date`). `gioiTinh`, `ngaySinh`, `soDienThoai` là của NGƯỜI KHÁM (xem `EXAMINEE_COLUMNS`).
 */
export interface DoctorAppointmentRow {
  maLichHen: string;
  trangThai: DoctorVisibleState;
  thoiGian: Date;
  ca: CaLamViec;
  nguoiKhamHoTen: string;
  quanHe: MoiQuanHeNguoiThan | null;
  gioiTinh: string | null;
  ngaySinh: string | null;
  soDienThoai: string | null;
  dichVu: string;
  chuyenKhoa: string;
  lyDoKham: string | null;
}

/** Hàng thô của câu chi tiết: thêm `chiNhanh` (`cn.ten`) và `ngayDat` (`thoi_diem_tao`, DATETIME ra `Date`). Không `lich_hen_id`, không `ly_do_huy`. */
export interface DoctorAppointmentDetailRow extends DoctorAppointmentRow {
  chiNhanh: string;
  ngayDat: Date;
}

// `ca` KHÔNG nằm ở `lich_hen`: nó là `lich_lam_viec.ca`, ghép qua `khung_gio` (cả hai khoá ngoại NOT NULL, khoá chính ở phía kia nên không đổi số hàng). Không suy `ca` từ giờ.
const CA_JOINS = `INNER JOIN khung_gio kg ON kg.khung_gio_id = lh.khung_gio_id
INNER JOIN lich_lam_viec llv ON llv.lich_lam_viec_id = kg.lich_lam_viec_id`;

// Người khám: khám cho chính mình (không có hồ sơ người thân) thì lấy ở TÀI KHOẢN của người đặt (`tbn`; `benh_nhan` không có ngày sinh, giới tính), khám cho người thân thì ở HỒ SƠ (`hs`).
// SĐT cũng vậy: người thân không có SĐT ⇒ NULL, KHÔNG thay bằng SĐT người đặt.
const SELF = 'lh.ho_so_nguoi_than_id IS NULL';
const examinee = (account: string, profile: string) =>
  `IF(${SELF}, ${account}, ${profile})`;
const EXAMINEE_PHONE = examinee('tbn.so_dien_thoai', 'hs.so_dien_thoai');

// `q` khớp mã lịch, tên người khám (hồ sơ hoặc tài khoản) và SĐT người khám; KHÔNG tên chính bác sĩ (`doctorName: false`) và không tên người đặt khi khám hộ người thân (Q35, TRACKING 3.20 (c)).
const KEYWORD_TARGETS: KeywordTargets = {
  nameColumns: ['COALESCE(hs.ho_ten, tbn.ho_ten)'],
  phoneColumn: EXAMINEE_PHONE,
  doctorName: false,
};

// Danh sách trắng cột, không `SELECT *`: không `lich_hen_id`, `benh_nhan_id`, giá, cọc, email, người đặt (DSB-06). Cột giá KHÔNG BAO GIỜ được SELECT.
const PAGE_COLUMNS = `SELECT lh.ma_lich_hen AS maLichHen, lh.trang_thai AS trangThai, lh.thoi_gian AS thoiGian, llv.ca AS ca,
  COALESCE(hs.ho_ten, tbn.ho_ten) AS nguoiKhamHoTen, hs.moi_quan_he AS quanHe,
  ${examinee('tbn.gioi_tinh', 'hs.gioi_tinh')} AS gioiTinh,
  DATE_FORMAT(${examinee('tbn.ngay_sinh', 'hs.ngay_sinh')}, '%Y-%m-%d') AS ngaySinh,
  ${EXAMINEE_PHONE} AS soDienThoai,
  dv.ten AS dichVu, ck.ten AS chuyenKhoa, lh.ly_do_kham AS lyDoKham`;

// Chi tiết: thêm chi nhánh (JOIN `cn` đã có trong `FROM_APPOINTMENTS`) và thời điểm đặt
const DETAIL_COLUMNS = `${PAGE_COLUMNS},
  cn.ten AS chiNhanh, lh.thoi_diem_tao AS ngayDat`;

/**
 * Điều kiện dùng CHUNG cho các câu của danh sách (đếm, theo trạng thái, trang): dựng một lần nên số đếm luôn đúng tập mà trang cắt ra. `lh.bac_si_id = ?` (từ access token) là điều kiện ĐẦU TIÊN
 * và luôn có, nằm TRONG SQL (H10): lịch của bác sĩ khác không bao giờ được đọc dù biết mã. `bacSiId` bắt buộc là chuỗi: thiếu giá trị thì `= NULL` không khớp hàng nào (đóng cửa khi lỗi).
 * Thứ tự: bác sĩ, trạng thái, `ca`, khoảng ngày, ô tìm.
 */
function filterOf(
  bacSiId: string,
  filter: DoctorAppointmentFilter,
): { sql: string; params: unknown[] } {
  const clauses: SqlClauses = {
    where: ['lh.bac_si_id = ?'],
    params: [bacSiId],
  };
  addStateFilter(clauses, filter.states);
  if (filter.ca !== null) {
    clauses.where.push('llv.ca = ?');
    clauses.params.push(filter.ca);
  }
  // `bacSiId` và `chuyenKhoaId` của bộ lọc chung để `null`: phạm vi ở trên, bộ lọc chuyên khoa không có ở Bác sĩ
  addCommonFilters(clauses, {
    bacSiId: null,
    chuyenKhoaId: null,
    from: filter.from,
    to: filter.to,
  });
  addKeywordFilter(clauses, filter.keyword, KEYWORD_TARGETS);
  return fromWhere(clauses, CA_JOINS);
}

/** Ba câu của danh sách và câu chi tiết; người gọi truyền `manager` của MỘT lần gọi `runReadOnly` nên các câu cùng ảnh chụp (P9). */
@Injectable()
export class DoctorAppointmentsRepository {
  /** Số lịch khớp bộ lọc (`COUNT(*)` là BIGINT nên ra chuỗi). */
  async count(
    em: EntityManager,
    bacSiId: string,
    filter: DoctorAppointmentFilter,
  ): Promise<number> {
    const { sql, params } = filterOf(bacSiId, filter);
    const rows = await em.query<{ total: string | number }[]>(
      `SELECT COUNT(*) AS total ${sql}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  /** Số lịch theo từng trạng thái (chỉ trạng thái có dòng); người gọi truyền bộ lọc KHÔNG có `trangThai[]` (DSB-11). */
  async countByStatus(
    em: EntityManager,
    bacSiId: string,
    filter: DoctorAppointmentFilter,
  ): Promise<{ trangThai: DoctorVisibleState; soLuong: number }[]> {
    return queryStatusCounts<DoctorVisibleState>(em, filterOf(bacSiId, filter));
  }

  /** Một trang. `limit` và `offset` đã kiểm (`PageQueryDto`) và `offset < total` (service). */
  async findPage(
    em: EntityManager,
    bacSiId: string,
    filter: DoctorAppointmentFilter,
    order: ListOrder,
    limit: number,
    offset: number,
  ): Promise<DoctorAppointmentRow[]> {
    const { sql, params } = filterOf(bacSiId, filter);
    return em.query<DoctorAppointmentRow[]>(
      `${PAGE_COLUMNS} ${sql}\n${ORDER_BY[order]} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
  }

  /**
   * Chi tiết MỘT lịch: MỘT câu `WHERE lh.bac_si_id = ? AND lh.ma_lich_hen = ?` NGAY TRONG SQL: lịch của bác sĩ khác và lịch không tồn tại cùng ra "không có hàng", không có nhánh nào chạy sau khi
   * thấy hàng của bác sĩ khác (H10, DSB-07). `maLichHen` đã chuẩn hoá chữ hoa (`ParseAppointmentCodePipe`; collation `utf8mb4_unicode_ci` không phân biệt hoa thường, H17). Tập trạng thái hiển thị:
   * `DaDoiLich` cũng ra "không có hàng" (câu (c)). Không khoá.
   */
  async findDetail(
    em: EntityManager,
    bacSiId: string,
    maLichHen: string,
  ): Promise<DoctorAppointmentDetailRow | null> {
    const clauses: SqlClauses = {
      where: ['lh.bac_si_id = ?', 'lh.ma_lich_hen = ?'],
      params: [bacSiId, maLichHen],
    };
    addStateFilter(clauses, DOCTOR_VISIBLE_STATES);
    const { sql, params } = fromWhere(clauses, CA_JOINS);
    const rows = await em.query<DoctorAppointmentDetailRow[]>(
      `${DETAIL_COLUMNS} ${sql}`,
      params,
    );
    return rows[0] ?? null;
  }
}
