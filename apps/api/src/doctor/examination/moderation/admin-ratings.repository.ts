import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  escapeLikePattern,
  LIKE_ESCAPE_CHARACTER,
} from '../../../common/paging/like-pattern.js';
import type {
  AdminRatingDetailRow,
  AdminRatingRow,
  StatusCountRow,
} from './admin-ratings.mapper.js';
import type { AdminRatingStatus } from './admin-ratings.rules.js';

// SQL thô của danh sách và chi tiết đánh giá cho Quản trị viên (doctor-exam B7; PLAN 5.8; KDD-01…KDD-03, KDD-17, KDD-19, KDD-21). Chỉ ĐỌC, không khoá. Mọi giá trị người dùng đi qua tham số `?`.
// Không ghi log: tên người đặt, tên bác sĩ, nhận xét và mã lịch là dữ liệu cá nhân. Người gọi truyền `manager` của MỘT lần gọi `runReadOnly`, nên câu đếm và câu trang cùng ảnh chụp.
// Đo M8 (X1: tìm `q` 143,4 ms ở 20.000 đánh giá): bỏ câu `COUNT(*)` thứ hai (service suy `total` từ câu đếm theo trạng thái) và PHÂN TRANG TRƯỚC rồi mới nối tên bác sĩ, chi nhánh, người đặt (không đổi DDL, không chỉ mục mới).

/** Bộ lọc dùng CHUNG cho câu đếm và câu trang (một hàm dựng `WHERE` nên hai câu không thể lệch phạm vi: QHK-11). `chiNhanhId` đã qua `BranchAccessPolicy.branchFilter`. */
export interface AdminRatingFilter {
  chiNhanhId?: string;
  bacSiId?: string;
  soSao?: number;
  q?: string;
}

interface Clause {
  /** `FROM … JOIN …` (kèm `tai_khoan` người đặt CHỈ khi có `q`) */
  from: string;
  /** rỗng khi không có lọc nào, ngược lại `WHERE a AND b …` */
  where: string;
  params: unknown[];
}

// Chi nhánh là `lich_hen.chi_nhanh_id` (chi nhánh lúc đặt, bất biến), KHÔNG phải chi nhánh hiện tại của bác sĩ (L10).
const BASE_FROM = `FROM danh_gia_bac_si dg
INNER JOIN lich_hen lh ON lh.lich_hen_id = dg.lich_hen_id`;
const BUYER_JOIN =
  'INNER JOIN tai_khoan tbn ON tbn.tai_khoan_id = lh.benh_nhan_id';
const STATUS_CONDITION: Record<AdminRatingStatus, string> = {
  HienThi: 'dg.bi_an = 0',
  DaAn: 'dg.bi_an = 1',
};

/** `trangThai` chỉ có ở câu trang; câu đếm không truyền (đếm áp mọi lọc TRỪ `trangThai`). Thứ tự điều kiện cố định: chi nhánh, bác sĩ, số sao, `q`, trạng thái. */
function clauseOf(
  filter: AdminRatingFilter,
  trangThai?: AdminRatingStatus,
): Clause {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.chiNhanhId !== undefined) {
    conditions.push('lh.chi_nhanh_id = ?');
    params.push(filter.chiNhanhId);
  }
  if (filter.bacSiId !== undefined) {
    conditions.push('lh.bac_si_id = ?');
    params.push(filter.bacSiId);
  }
  if (filter.soSao !== undefined) {
    conditions.push('dg.so_sao = ?');
    params.push(filter.soSao);
  }
  if (filter.q !== undefined) {
    const pattern = `%${escapeLikePattern(filter.q)}%`;
    conditions.push(
      `(tbn.ho_ten LIKE ? ESCAPE '${LIKE_ESCAPE_CHARACTER}' OR dg.nhan_xet LIKE ? ESCAPE '${LIKE_ESCAPE_CHARACTER}')`,
    );
    params.push(pattern, pattern);
  }
  if (trangThai !== undefined) conditions.push(STATUS_CONDITION[trangThai]);
  return {
    from: filter.q === undefined ? BASE_FROM : `${BASE_FROM}\n${BUYER_JOIN}`,
    where:
      conditions.length === 0 ? '' : `WHERE ${conditions.join('\n  AND ')}`,
    params,
  };
}

/** Câu đếm: một hàng mỗi trạng thái có đánh giá (thiếu hàng = 0). */
export function countSql(clause: Pick<Clause, 'from' | 'where'>): string {
  return `SELECT dg.bi_an AS biAn, COUNT(*) AS soLuong\n${clause.from}\n${clause.where}\nGROUP BY dg.bi_an`;
}

/**
 * Câu trang: truy vấn con PHÂN TRANG TRƯỚC trên `danh_gia_bac_si` nối `lich_hen` (kèm người đặt khi có `q`), RỒI nối tên bác sĩ (`tbs`), chi nhánh (`cn`) và người đặt (`nd`) cho ≤ `pageSize` dòng.
 * Thứ tự lặp lại ở câu ngoài để kết quả xác định (MySQL không đảm bảo thứ tự của bảng dẫn xuất).
 */
export function pageSql(clause: Pick<Clause, 'from' | 'where'>): string {
  return `SELECT p.danhGiaId AS danhGiaId, p.bacSiId AS bacSiId, tbs.ho_ten AS bacSiHoTen, p.chiNhanhId AS chiNhanhId, cn.ten AS chiNhanhTen,
  nd.ho_ten AS nguoiDanhGiaHoTen, p.soSao AS soSao, p.nhanXet AS nhanXet, p.thoiDiemTao AS thoiDiemTao, p.biAn AS biAn
FROM (
  SELECT dg.danh_gia_bac_si_id AS danhGiaId, dg.so_sao AS soSao, dg.nhan_xet AS nhanXet, dg.thoi_diem_tao AS thoiDiemTao, dg.bi_an AS biAn,
    lh.bac_si_id AS bacSiId, lh.chi_nhanh_id AS chiNhanhId, lh.benh_nhan_id AS nguoiDatId
  ${clause.from}
  ${clause.where}
  ORDER BY dg.thoi_diem_tao DESC, dg.danh_gia_bac_si_id DESC LIMIT ? OFFSET ?
) p
INNER JOIN tai_khoan tbs ON tbs.tai_khoan_id = p.bacSiId
INNER JOIN chi_nhanh cn ON cn.chi_nhanh_id = p.chiNhanhId
INNER JOIN tai_khoan nd ON nd.tai_khoan_id = p.nguoiDatId
ORDER BY p.thoiDiemTao DESC, p.danhGiaId DESC`;
}

/** Chi tiết: MỘT câu theo khoá chính. Chi nhánh lấy từ `lich_hen.chi_nhanh_id` để service kiểm phạm vi. Không SĐT, email, `ly_do_kham`, `benh_nhan_id`. */
export const READ_DETAIL_SQL = `SELECT dg.danh_gia_bac_si_id AS danhGiaId, lh.bac_si_id AS bacSiId, tbs.ho_ten AS bacSiHoTen, lh.chi_nhanh_id AS chiNhanhId, cn.ten AS chiNhanhTen,
  nd.ho_ten AS nguoiDanhGiaHoTen, dg.so_sao AS soSao, dg.nhan_xet AS nhanXet, dg.thoi_diem_tao AS thoiDiemTao, dg.bi_an AS biAn,
  lh.ma_lich_hen AS maLichHen, lh.thoi_gian AS thoiGianKham, dg.ly_do_an AS lyDoAn
FROM danh_gia_bac_si dg
INNER JOIN lich_hen lh ON lh.lich_hen_id = dg.lich_hen_id
INNER JOIN tai_khoan tbs ON tbs.tai_khoan_id = lh.bac_si_id
INNER JOIN chi_nhanh cn ON cn.chi_nhanh_id = lh.chi_nhanh_id
INNER JOIN tai_khoan nd ON nd.tai_khoan_id = lh.benh_nhan_id
WHERE dg.danh_gia_bac_si_id = ?`;

@Injectable()
export class AdminRatingsRepository {
  /** Số đánh giá theo trạng thái, áp mọi lọc TRỪ `trangThai`; `total` của danh sách suy từ đây. */
  countByStatus(
    em: EntityManager,
    filter: AdminRatingFilter,
  ): Promise<StatusCountRow[]> {
    const clause = clauseOf(filter);
    return em.query<StatusCountRow[]>(countSql(clause), clause.params);
  }

  /** Một trang. `limit` và `offset` đã kiểm (DTO) và `offset < total` (service: không gửi `OFFSET` khổng lồ cho MySQL, nơi nó báo 1064 ra 500). */
  findPage(
    em: EntityManager,
    filter: AdminRatingFilter,
    trangThai: AdminRatingStatus | undefined,
    limit: number,
    offset: number,
  ): Promise<AdminRatingRow[]> {
    const clause = clauseOf(filter, trangThai);
    return em.query<AdminRatingRow[]>(pageSql(clause), [
      ...clause.params,
      limit,
      offset,
    ]);
  }

  async findOne(
    em: EntityManager,
    id: string,
  ): Promise<AdminRatingDetailRow | null> {
    const rows = await em.query<AdminRatingDetailRow[]>(READ_DETAIL_SQL, [id]);
    return rows[0] ?? null;
  }
}
