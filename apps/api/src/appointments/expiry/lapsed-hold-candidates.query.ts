import type { EntityManager } from 'typeorm';

// Câu CHỌN ỨNG VIÊN của `HoldExpiryJob` (PLAN booking 5.5; số đo X1 M5, TRACKING 3.9.4): lịch `ChoThanhToan` có `han_thanh_toan <= now`, theo lô, CHỈ ĐỌC. Đây chỉ là DANH SÁCH ứng viên;
// quyết định thật nằm ở `AppointmentTransitionService.expire` dưới khoá (lịch vừa thanh toán hay vừa huỷ chỉ bị bỏ qua, `NotDue`).
//
// Dạng câu là dạng ĐÃ ĐO: `ORDER BY han_thanh_toan, lich_hen_id` khớp thứ tự chỉ mục `lich_hen_index_11 (trang_thai, han_thanh_toan)` (cột khoá chính nằm cuối mọi chỉ mục phụ của InnoDB) nên
// MySQL đọc thẳng theo chỉ mục, không `filesort` (đo ở 100.000 lịch quá hạn: `range` trên `lich_hen_index_11`, `Using index`; TRACKING 3.19). Sắp theo khoá chính thuần thì kế hoạch phụ thuộc chỗ
// các lịch quá hạn nằm trong bảng (quét khoá chính rồi lọc), nên không dùng. Con trỏ `(han_thanh_toan, lich_hen_id) > (…)` là khoá DUY NHẤT từng hàng (không bỏ sót hàng cùng hạn, không lặp vô
// hạn); lịch lỗi vĩnh viễn nằm TRƯỚC con trỏ nên không chặn các lịch sau. Chi phí: MySQL không dùng cận con trỏ làm điểm bắt đầu quét, nên lô thứ k quét khoảng k × 100 mục chỉ mục (tối đa khoảng
// 1.000 ở lô thứ 10 vì trần `BOOKING_JOB_MAX_BATCHES`).
//
// `han` đọc bằng DATE_FORMAT thành chuỗi giờ Việt Nam và được truyền ngược NGUYÊN CHUỖI làm con trỏ: không qua `Date` nên không có bẫy múi giờ (doctor M4, H13). `:now` là mốc
// `toSecond(nowVN())` của người gọi, không `NOW()` (AR-04).

/** Hàng cuối của lô trước: `han` dạng 'YYYY-MM-DD HH:MM:SS', `lichHenId` dạng chuỗi số */
export interface LapsedHoldCursor {
  han: string;
  lichHenId: string;
}

export interface LapsedHoldCandidate {
  lichHenId: string;
  han: string;
}

const SELECT_SQL = `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, DATE_FORMAT(han_thanh_toan, '%Y-%m-%d %H:%i:%s') AS han
FROM lich_hen
WHERE trang_thai = 'ChoThanhToan' AND han_thanh_toan <= ?`;
const AFTER_CURSOR_SQL = ' AND (han_thanh_toan, lich_hen_id) > (?, ?)';
const ORDER_SQL = ' ORDER BY han_thanh_toan, lich_hen_id LIMIT ?';

/** Một lô tối đa `limit` ứng viên, theo `(han_thanh_toan, lich_hen_id)` tăng dần, bắt đầu SAU `after` (hoặc từ đầu khi `null`). */
export function findLapsedHoldCandidates(
  em: EntityManager,
  input: { now: Date; after: LapsedHoldCursor | null; limit: number },
): Promise<LapsedHoldCandidate[]> {
  const params: unknown[] = [input.now];
  let sql = SELECT_SQL;
  if (input.after !== null) {
    sql += AFTER_CURSOR_SQL;
    params.push(input.after.han, input.after.lichHenId);
  }
  sql += ORDER_SQL;
  params.push(input.limit);
  return em.query<LapsedHoldCandidate[]>(sql, params);
}
