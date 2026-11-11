import type { EntityManager } from 'typeorm';
import { toSecond } from '../../common/time/time.js';
import { HOLD_EXPIRED_CANCEL_REASON } from '../appointments.constants.js';
import { parseVnDateTime } from '../slots/slot-lock.js';

// Huỷ lịch `ChoThanhToan` ĐÃ HẾT HẠN giữ khung giờ (hết hạn lười, PLAN booking 5.5; TRACKING 3.14 B6-D). Đây là nơi DUY NHẤT của B6 ghi `lich_hen.trang_thai` (luật AR-06: `UPDATE lich_hen` chỉ ở
// `appointments/state/`). B9 sẽ bọc đúng hàm này (cùng `SlotHoldService.release`) trong `AppointmentTransitionService.expire`, KHÔNG viết `UPDATE` thứ hai.
//
// Khoá `lich_hen` THEO KHOÁ CHÍNH (PLAN 5.3 tầng 6, quy tắc 7; ĐÃ CHỐT bằng ca đo B6b, TRACKING 3.14.4): người gọi đã khoá `khung_gio` (tầng 5), đọc thường `lich_hen_id` của lịch đang giữ nó rồi
// gọi hàm này. Hàm nhận `em` của người gọi và KHÔNG mở giao dịch; không ném `AppException`.

export type CancelLapsedHoldOutcome =
  /** Lịch cũ ở `DaHuy`, `thoi_diem_huy` = `now`, `ly_do_huy` = `HOLD_EXPIRED_CANCEL_REASON` */
  | { kind: 'Cancelled' }
  /** Lịch còn `ChoThanhToan` nhưng `han_thanh_toan` chưa tới (hoặc không có hạn): không ghi gì */
  | { kind: 'NotLapsed' }
  /** Lịch không còn `ChoThanhToan` dưới khoá (đã thanh toán, đã huỷ) hoặc không còn: không ghi gì */
  | { kind: 'HolderChanged' };

// `FOR UPDATE` theo `lich_hen_id` (khoá chính), đọc trạng thái và hạn MỚI NHẤT dưới khoá (không phải bản đọc thường trước đó).
const LOCK_HOLDER_SQL = `SELECT trang_thai AS trangThai, DATE_FORMAT(han_thanh_toan, '%Y-%m-%d %H:%i:%s') AS hanThanhToan
FROM lich_hen WHERE lich_hen_id = ?
FOR UPDATE`;

// Điều kiện `trang_thai = 'ChoThanhToan'` lặp lại trong `UPDATE`: lưới an toàn thứ hai (đúng 1 hàng ⇒ `Cancelled`).
const CANCEL_SQL = `UPDATE lich_hen SET trang_thai = 'DaHuy', thoi_diem_huy = ?, ly_do_huy = ?
WHERE lich_hen_id = ? AND trang_thai = 'ChoThanhToan'`;

/**
 * Khoá lịch theo khoá chính, kiểm LẠI dưới khoá rằng nó còn `ChoThanhToan` và `han_thanh_toan <= now` (nửa mở, như `giu_cho_den`), rồi huỷ. `now` là mốc `toSecond(nowVN())` của luồng
 * (tham số `:now`, không `NOW()`, AR-04). KHÔNG đặt khung giờ về `ConTrong`: đó là việc của `SlotHoldService.release` trong cùng giao dịch của người gọi.
 */
export async function cancelLapsedHold(
  em: EntityManager,
  input: { lichHenId: string; now: Date },
): Promise<CancelLapsedHoldOutcome> {
  const now = toSecond(input.now);
  const rows = await em.query<
    { trangThai: string; hanThanhToan: string | null }[]
  >(LOCK_HOLDER_SQL, [input.lichHenId]);
  const row = rows[0];
  if (row === undefined || row.trangThai !== 'ChoThanhToan')
    return { kind: 'HolderChanged' };
  // Lịch `ChoThanhToan` mà không có hạn là dữ liệu hỏng (INV-02): không huỷ thứ không có hạn, báo `NotLapsed`
  if (
    row.hanThanhToan === null ||
    parseVnDateTime(row.hanThanhToan).getTime() > now.getTime()
  )
    return { kind: 'NotLapsed' };
  const result: { affectedRows?: number } = await em.query(CANCEL_SQL, [
    now,
    HOLD_EXPIRED_CANCEL_REASON,
    input.lichHenId,
  ]);
  return result.affectedRows === 1
    ? { kind: 'Cancelled' }
    : { kind: 'HolderChanged' };
}
