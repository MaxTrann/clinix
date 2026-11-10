import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import { foldDStroke } from '../../patient/validation/keyword-policy.js';
import type { PatientVisibleState } from './patient-appointments.dto.js';
import { VISIT_PROFILE_SELF } from './list-query.rules.js';

// SQL thô của danh sách lịch hẹn Bệnh nhân (task B1; PLAN booking 5.8; TRACKING 3.13 B1-C). Chỉ ĐỌC. Mọi giá trị người dùng đi qua tham số `?`, không bao giờ nối vào
// câu SQL (chỉ chiều sắp xếp, lấy từ hai hằng bên dưới). Không ghi log: mã lịch, tên người khám, tên bác sĩ là dữ liệu cá nhân (H10).

/** Bộ lọc của MỘT câu: `states` đã là giao của tập hiển thị, `nhom` và (với câu danh sách) `trangThai[]`; rỗng ⇒ không dòng nào. */
export interface PatientAppointmentFilter {
  states: readonly PatientVisibleState[];
  /** `BanThan` hoặc id hồ sơ người thân (chuỗi) */
  hoSoNguoiThanId: string | null;
  bacSiId: string | null;
  chuyenKhoaId: string | null;
  /** `thoi_gian >= from`; chuỗi `YYYY-MM-DD HH:mm:ss` giờ VN */
  from: string | null;
  /** `thoi_gian < to` */
  to: string | null;
  /** Từ khoá ĐÃ chuẩn hoá và hợp lệ (2 đến 100 ký tự) */
  keyword: string | null;
}

export type ListOrder = 'ASC' | 'DESC';

/**
 * Hàng thô của câu trang. `thoi_gian` và `han_thanh_toan` (DATETIME) ra `Date` nhờ múi giờ của driver (`DB_TIMEZONE`); BIGINT và biểu thức logic ra
 * chuỗi hoặc số tuỳ driver nên `laBanThan` đọc bằng `Number(...)`; tiền đã `CAST … AS CHAR` ở SQL nên là chuỗi decimal.
 */
export interface PatientAppointmentRow {
  maLichHen: string;
  trangThai: PatientVisibleState;
  thoiGian: Date;
  bacSi: string;
  chuyenKhoa: string;
  chiNhanh: string;
  dichVu: string;
  laBanThan: number | string;
  nguoiKham: string;
  giaSnapshot: string;
  tienCoc: string;
  hanThanhToan: Date | null;
}

// Mọi JOIN trong đều qua khoá ngoại NOT NULL nên không đổi số hàng; không lọc `trang_thai` của bác sĩ hay chuyên khoa (lịch sử vẫn hiện tên). Chuyên khoa lấy qua
// `bac_si.chuyen_khoa_id` HIỆN TẠI (L14). Hồ sơ người thân: LEFT JOIN, vì lịch của bản thân không có hồ sơ; khoá ngoại kép ở `lich_hen` đảm bảo hồ sơ cùng chủ.
const FROM_APPOINTMENTS = `FROM lich_hen lh
INNER JOIN bac_si bs ON bs.tai_khoan_id = lh.bac_si_id
INNER JOIN tai_khoan tbs ON tbs.tai_khoan_id = lh.bac_si_id
INNER JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = bs.chuyen_khoa_id
INNER JOIN chi_nhanh cn ON cn.chi_nhanh_id = lh.chi_nhanh_id
INNER JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = lh.dich_vu_kham_id
INNER JOIN tai_khoan tbn ON tbn.tai_khoan_id = lh.benh_nhan_id
LEFT JOIN ho_so_nguoi_than hs ON hs.ho_so_nguoi_than_id = lh.ho_so_nguoi_than_id`;

// Danh sách trắng cột, không `SELECT *`: không `lich_hen_id`, `benh_nhan_id`, email hay SĐT bác sĩ (LSH-14). Người khám: bản thân là họ tên tài khoản, người thân là họ tên hồ sơ.
const PAGE_COLUMNS = `SELECT lh.ma_lich_hen AS maLichHen, lh.trang_thai AS trangThai, lh.thoi_gian AS thoiGian,
  tbs.ho_ten AS bacSi, ck.ten AS chuyenKhoa, cn.ten AS chiNhanh, dv.ten AS dichVu,
  (lh.ho_so_nguoi_than_id IS NULL) AS laBanThan, COALESCE(hs.ho_ten, tbn.ho_ten) AS nguoiKham,
  CAST(lh.gia_snapshot AS CHAR) AS giaSnapshot, CAST(lh.tien_coc_snapshot AS CHAR) AS tienCoc,
  lh.han_thanh_toan AS hanThanhToan`;

// Họ tên so sau khi gấp `đ` và `Đ` thành `d` (REPLACE phân biệt hoa thường nên hai lớp; từ khoá cũng đã gấp bằng `foldDStroke`): `đ` không bằng `d` trong
// `utf8mb4_unicode_ci`. Biểu thức chép từ `patient/reception-lookup/patient-lookup.repository.ts` (TECH_DEBT dòng 94). Người khám của lịch người thân chỉ khớp tên NGƯỜI THÂN.
const foldedName = (column: string) =>
  `REPLACE(REPLACE(${column}, 'đ', 'd'), 'Đ', 'D') LIKE ? ESCAPE '!'`;
const KEYWORD_CONDITIONS = [
  `lh.ma_lich_hen LIKE ? ESCAPE '!'`,
  foldedName('tbs.ho_ten'),
  foldedName('COALESCE(hs.ho_ten, tbn.ho_ten)'),
];

/**
 * Điều kiện dùng CHUNG cho cả ba câu (đếm, theo trạng thái, trang): dựng một lần nên số đếm luôn đúng tập mà trang cắt ra. `lh.benh_nhan_id = ?` (chủ sở hữu,
 * từ access token) là điều kiện ĐẦU TIÊN và luôn có, nằm TRONG SQL (H10): hồ sơ hay lịch của người khác không bao giờ được đọc, dù biết id.
 */
function filterOf(
  patientId: string,
  filter: PatientAppointmentFilter,
): { sql: string; params: unknown[] } {
  const where = ['lh.benh_nhan_id = ?'];
  const params: unknown[] = [patientId];
  if (filter.states.length === 0) {
    where.push('1 = 0');
  } else {
    where.push(`lh.trang_thai IN (${filter.states.map(() => '?').join(', ')})`);
    params.push(...filter.states);
  }
  if (filter.hoSoNguoiThanId === VISIT_PROFILE_SELF) {
    where.push('lh.ho_so_nguoi_than_id IS NULL');
  } else if (filter.hoSoNguoiThanId !== null) {
    where.push('lh.ho_so_nguoi_than_id = ?');
    params.push(filter.hoSoNguoiThanId);
  }
  if (filter.bacSiId !== null) {
    where.push('lh.bac_si_id = ?');
    params.push(filter.bacSiId);
  }
  if (filter.chuyenKhoaId !== null) {
    where.push('bs.chuyen_khoa_id = ?');
    params.push(filter.chuyenKhoaId);
  }
  // Khoảng NỬA MỞ trên `thoi_gian`, không bọc cột bằng DATE() (AR-05)
  if (filter.from !== null) {
    where.push('lh.thoi_gian >= ?');
    params.push(filter.from);
  }
  if (filter.to !== null) {
    where.push('lh.thoi_gian < ?');
    params.push(filter.to);
  }
  const keyword = filter.keyword;
  if (keyword !== null) {
    // Thứ tự tham số theo KEYWORD_CONDITIONS: mã lịch (nguyên văn), tên bác sĩ, tên người khám (hai tên đã gấp `đ`)
    const code = `%${escapeLikePattern(keyword)}%`;
    const name = `%${escapeLikePattern(foldDStroke(keyword))}%`;
    where.push(`(${KEYWORD_CONDITIONS.join(' OR ')})`);
    params.push(code, name, name);
  }
  return {
    sql: `${FROM_APPOINTMENTS}\nWHERE ${where.join('\n  AND ')}`,
    params,
  };
}

// Chiều sắp xếp chỉ lấy từ hai hằng này, không từ đầu vào
const ORDER_BY: Record<ListOrder, string> = {
  ASC: 'ORDER BY lh.thoi_gian ASC, lh.lich_hen_id ASC',
  DESC: 'ORDER BY lh.thoi_gian DESC, lh.lich_hen_id DESC',
};

/** Ba câu của danh sách; người gọi truyền `manager` của MỘT lần gọi `runReadOnly` nên cả ba cùng ảnh chụp (P9). */
@Injectable()
export class PatientAppointmentsRepository {
  /** Số lịch khớp bộ lọc (`COUNT(*)` là BIGINT nên ra chuỗi). */
  async count(
    em: EntityManager,
    patientId: string,
    filter: PatientAppointmentFilter,
  ): Promise<number> {
    const { sql, params } = filterOf(patientId, filter);
    const rows = await em.query<{ total: string | number }[]>(
      `SELECT COUNT(*) AS total ${sql}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  /** Số lịch theo từng trạng thái (chỉ trạng thái có dòng); người gọi truyền bộ lọc KHÔNG có `trangThai[]` (LSH-05). */
  async countByStatus(
    em: EntityManager,
    patientId: string,
    filter: PatientAppointmentFilter,
  ): Promise<{ trangThai: PatientVisibleState; soLuong: number }[]> {
    const { sql, params } = filterOf(patientId, filter);
    const rows = await em.query<
      { trangThai: PatientVisibleState; soLuong: string | number }[]
    >(
      `SELECT lh.trang_thai AS trangThai, COUNT(*) AS soLuong ${sql}\nGROUP BY lh.trang_thai`,
      params,
    );
    return rows.map((row) => ({
      trangThai: row.trangThai,
      soLuong: Number(row.soLuong),
    }));
  }

  /** Một trang. `limit` và `offset` đã kiểm (`PageQueryDto`) và `offset < total` (service). */
  async findPage(
    em: EntityManager,
    patientId: string,
    filter: PatientAppointmentFilter,
    order: ListOrder,
    limit: number,
    offset: number,
  ): Promise<PatientAppointmentRow[]> {
    const { sql, params } = filterOf(patientId, filter);
    return em.query<PatientAppointmentRow[]>(
      `${PAGE_COLUMNS} ${sql}\n${ORDER_BY[order]} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
  }
}
