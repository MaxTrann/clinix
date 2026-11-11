import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import {
  addBranchFilter,
  addCommonFilters,
  addKeywordFilter,
  addStateFilter,
  fromWhere,
  ITEM_COLUMNS,
  ORDER_BY,
  type KeywordTargets,
  type ListItemRow,
  type ListOrder,
  type SqlClauses,
} from './list-query.sql.js';

// SQL thô của danh sách và chi tiết lịch hẹn cho Lễ tân (B3) và Quản trị viên (B4) (PLAN booking 5.8; TRACKING 3.17 B3-C, B3-D). Chỉ ĐỌC. FROM, cột, bộ lọc, ô tìm, sắp xếp lấy từ
// `list-query.sql.ts` (dùng chung với B1). Phạm vi chi nhánh là điều kiện ĐẦU của MỌI câu và nằm TRONG SQL (H10). Không ghi log: mã lịch, tên, SĐT là dữ liệu cá nhân.

/** Bộ lọc của MỘT câu. `chiNhanhId` đến từ `BranchAccessPolicy.branchFilter`, `undefined` = Toàn hệ thống không lọc chi nhánh. `states` đã là tập cuối cùng; rỗng ⇒ không dòng nào. */
export interface OperationsAppointmentFilter {
  chiNhanhId: string | undefined;
  states: readonly TrangThaiLichHen[];
  bacSiId: string | null;
  chuyenKhoaId: string | null;
  dichVuKhamId: string | null;
  /** `thoi_gian >= from`; chuỗi `YYYY-MM-DD HH:mm:ss` giờ VN */
  from: string | null;
  /** `thoi_gian < to` */
  to: string | null;
  /** Từ khoá ĐÃ chuẩn hoá và hợp lệ (2 đến 100 ký tự) */
  keyword: string | null;
}

/** Hàng thô của câu trang: mười hai cột chung cộng người đặt (`tbn` là tài khoản của `benh_nhan_id`, đã nối sẵn ở `FROM_APPOINTMENTS`). */
export interface OperationsAppointmentRow extends ListItemRow {
  nguoiDatHoTen: string;
  nguoiDatSoDienThoai: string;
}

/**
 * Hàng thô của câu chi tiết: thêm `lichHenId` (BIGINT ra chuỗi nhờ cấu hình driver) CHỈ để service gọi cổng thanh toán, nó không bao giờ ra JSON (mapper ánh xạ từng khoá), `lyDoKham` và `lyDoHuy`.
 */
export interface OperationsAppointmentDetailRow extends OperationsAppointmentRow {
  lichHenId: string;
  lyDoKham: string | null;
  lyDoHuy: string | null;
}

// Người đặt: tài khoản của `benh_nhan_id`. Người khám có thể là hồ sơ người thân nên `q` khớp cả hai họ tên; SĐT chỉ của người đặt (đúng cái hiện trên dòng).
const KEYWORD_TARGETS: KeywordTargets = {
  nameColumns: ['hs.ho_ten', 'tbn.ho_ten'],
  phoneColumn: 'tbn.so_dien_thoai',
};

const PAGE_COLUMNS = `${ITEM_COLUMNS},
  tbn.ho_ten AS nguoiDatHoTen, tbn.so_dien_thoai AS nguoiDatSoDienThoai`;

// Chi tiết: `lich_hen_id` chỉ để gọi cổng; `ly_do_kham` là chữ tự do của Bệnh nhân (Q9), `ly_do_huy` của Lễ tân hay Quản trị viên (Q27)
const DETAIL_COLUMNS = `${PAGE_COLUMNS},
  lh.lich_hen_id AS lichHenId, lh.ly_do_kham AS lyDoKham, lh.ly_do_huy AS lyDoHuy`;

/** Điều kiện dùng CHUNG cho cả hai câu (đếm và trang): dựng một lần nên `total` luôn đúng tập mà trang cắt ra. Điều kiện chi nhánh đứng đầu, rồi trạng thái (luôn có) nên `WHERE` không bao giờ rỗng. */
function filterOf(filter: OperationsAppointmentFilter) {
  const clauses: SqlClauses = { where: [], params: [] };
  addBranchFilter(clauses, filter.chiNhanhId);
  addStateFilter(clauses, filter.states);
  addCommonFilters(clauses, filter);
  addKeywordFilter(clauses, filter.keyword, KEYWORD_TARGETS);
  return fromWhere(clauses);
}

/** Hai câu của danh sách và câu chi tiết; người gọi truyền `manager` của MỘT lần gọi `runReadOnly` nên các câu cùng ảnh chụp (P9). */
@Injectable()
export class OperationsAppointmentsRepository {
  /** Số lịch khớp bộ lọc (`COUNT(*)` là BIGINT nên ra chuỗi). */
  async count(
    em: EntityManager,
    filter: OperationsAppointmentFilter,
  ): Promise<number> {
    const { sql, params } = filterOf(filter);
    const rows = await em.query<{ total: string | number }[]>(
      `SELECT COUNT(*) AS total ${sql}`,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  /** Một trang. `limit` và `offset` đã kiểm (`PageQueryDto`) và `offset < total` (service). */
  async findPage(
    em: EntityManager,
    filter: OperationsAppointmentFilter,
    order: ListOrder,
    limit: number,
    offset: number,
  ): Promise<OperationsAppointmentRow[]> {
    const { sql, params } = filterOf(filter);
    return em.query<OperationsAppointmentRow[]>(
      `${PAGE_COLUMNS} ${sql}\n${ORDER_BY[order]} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
  }

  /**
   * Chi tiết MỘT lịch. Tra theo `ma_lich_hen` (UNIQUE) và `lh.chi_nhanh_id = ?` NGAY TRONG SQL: lịch ngoài chi nhánh và lịch không tồn tại cùng ra "không có hàng", không có nhánh nào
   * chạy sau khi thấy hàng của chi nhánh khác (H10, DSV-09, QB-04). `maLichHen` đã chuẩn hoá chữ hoa (`ParseAppointmentCodePipe`; collation `utf8mb4_unicode_ci` không phân biệt hoa thường, H17).
   * Không lọc trạng thái (kể cả `DaDoiLich`: là lịch của chính chi nhánh, nhân sự được xem). Không khoá.
   */
  async findDetail(
    em: EntityManager,
    chiNhanhId: string | undefined,
    maLichHen: string,
  ): Promise<OperationsAppointmentDetailRow | null> {
    const clauses: SqlClauses = { where: [], params: [] };
    addBranchFilter(clauses, chiNhanhId);
    clauses.where.push('lh.ma_lich_hen = ?');
    clauses.params.push(maLichHen);
    const { sql, params } = fromWhere(clauses);
    const rows = await em.query<OperationsAppointmentDetailRow[]>(
      `${DETAIL_COLUMNS} ${sql}`,
      params,
    );
    return rows[0] ?? null;
  }
}
