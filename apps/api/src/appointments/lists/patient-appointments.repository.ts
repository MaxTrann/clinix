import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { PatientVisibleState } from './patient-appointments.dto.js';
import { VISIT_PROFILE_SELF } from './list-query.rules.js';
import {
  addCommonFilters,
  addKeywordFilter,
  addStateFilter,
  FROM_APPOINTMENTS,
  fromWhere,
  ITEM_COLUMNS,
  ORDER_BY,
  type ListItemRow,
  type ListOrder,
  type SqlClauses,
} from './list-query.sql.js';

// SQL thô của danh sách lịch hẹn Bệnh nhân (task B1; PLAN booking 5.8; TRACKING 3.13 B1-C). Chỉ ĐỌC. Mọi giá trị người dùng đi qua tham số `?`, không bao giờ nối vào
// câu SQL (chỉ chiều sắp xếp, lấy từ hằng `ORDER_BY`). Không ghi log: mã lịch, tên người khám, tên bác sĩ là dữ liệu cá nhân (H10). FROM, cột, bộ lọc ngày, ô tìm và sắp xếp nằm ở
// `list-query.sql.ts` (dùng chung với danh sách của Lễ tân B3, Quản trị viên B4); file này chỉ còn phần RIÊNG của Bệnh nhân: điều kiện chủ sở hữu, tập trạng thái hiển thị, hồ sơ người thân.

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

/** Hàng thô của câu trang: mười hai cột chung (`ListItemRow`, giải thích kiểu của từng cột ở đó) với tập trạng thái Bệnh nhân được thấy. */
export type PatientAppointmentRow = ListItemRow<PatientVisibleState>;

/**
 * Hàng thô của câu chi tiết (task B2): thêm `lichHenId` (BIGINT ra chuỗi nhờ cấu hình driver) CHỈ để service gọi cổng thanh toán và hoàn tiền, nó không bao giờ
 * ra JSON (`toDetail` ánh xạ từng khoá; LSH-14), và `lyDoKham`. Không đọc `ly_do_huy`: lý do Lễ tân, Quản trị viên nhập là chữ tự do dùng để truy vết nội bộ
 * (Q27), chưa trả cho Bệnh nhân (TRACKING 3.15, câu (h)).
 */
export interface PatientAppointmentDetailRow extends PatientAppointmentRow {
  lichHenId: string;
  lyDoKham: string | null;
}

// Chi tiết: `lich_hen_id` chỉ để gọi cổng; `ly_do_kham` là văn bản tự do của chính Bệnh nhân (Q9)
const DETAIL_COLUMNS = `${ITEM_COLUMNS},
  lh.lich_hen_id AS lichHenId, lh.ly_do_kham AS lyDoKham`;

// Người khám của lịch người thân chỉ khớp tên NGƯỜI THÂN (`COALESCE`): cột tên của ô tìm, ngoài tên bác sĩ và mã lịch luôn có (không khớp SĐT: Bệnh nhân chỉ tìm lịch của mình)
const KEYWORD_TARGETS = { nameColumns: ['COALESCE(hs.ho_ten, tbn.ho_ten)'] };

/**
 * Điều kiện dùng CHUNG cho cả ba câu (đếm, theo trạng thái, trang): dựng một lần nên số đếm luôn đúng tập mà trang cắt ra. `lh.benh_nhan_id = ?` (chủ sở hữu,
 * từ access token) là điều kiện ĐẦU TIÊN và luôn có, nằm TRONG SQL (H10): hồ sơ hay lịch của người khác không bao giờ được đọc, dù biết id. Thứ tự: chủ sở hữu, trạng thái,
 * hồ sơ người thân, rồi bác sĩ, chuyên khoa, ngày, ô tìm (các điều kiện chung ở `list-query.sql.ts`).
 */
function filterOf(
  patientId: string,
  filter: PatientAppointmentFilter,
): { sql: string; params: unknown[] } {
  const clauses: SqlClauses = {
    where: ['lh.benh_nhan_id = ?'],
    params: [patientId],
  };
  addStateFilter(clauses, filter.states);
  if (filter.hoSoNguoiThanId === VISIT_PROFILE_SELF) {
    clauses.where.push('lh.ho_so_nguoi_than_id IS NULL');
  } else if (filter.hoSoNguoiThanId !== null) {
    clauses.where.push('lh.ho_so_nguoi_than_id = ?');
    clauses.params.push(filter.hoSoNguoiThanId);
  }
  addCommonFilters(clauses, filter);
  addKeywordFilter(clauses, filter.keyword, KEYWORD_TARGETS);
  return fromWhere(clauses);
}

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
      `${ITEM_COLUMNS} ${sql}\n${ORDER_BY[order]} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
  }

  /**
   * Chi tiết MỘT lịch (task B2; TRACKING 3.15 B2-D). Tra theo `ma_lich_hen` (UNIQUE) và `lh.benh_nhan_id = ?` (chủ sở hữu, từ access token) NGAY TRONG SQL: lịch của người
   * khác và lịch không tồn tại cùng ra "không có hàng", không có nhánh nào chạy sau khi thấy hàng của người khác (H10). `maLichHen` đã chuẩn hoá chữ hoa
   * (`ParseAppointmentCodePipe`; collation `utf8mb4_unicode_ci` không phân biệt hoa thường, H17). `states` là tập hiển thị của Bệnh nhân: `DaDoiLich` cũng ra "không có hàng"
   * (Q31). Không khoá. Người gọi truyền `manager` của MỘT lần gọi `runReadOnly` (cùng ảnh chụp với các câu của cổng).
   */
  async findDetail(
    em: EntityManager,
    patientId: string,
    maLichHen: string,
    states: readonly PatientVisibleState[],
  ): Promise<PatientAppointmentDetailRow | null> {
    const rows = await em.query<PatientAppointmentDetailRow[]>(
      `${DETAIL_COLUMNS} ${FROM_APPOINTMENTS}
WHERE lh.ma_lich_hen = ?
  AND lh.benh_nhan_id = ?
  AND lh.trang_thai IN (${states.map(() => '?').join(', ')})`,
      [maLichHen, patientId, ...states],
    );
    return rows[0] ?? null;
  }
}
