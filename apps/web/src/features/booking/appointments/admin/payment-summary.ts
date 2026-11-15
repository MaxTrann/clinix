import { isPositiveAmount } from '../common/appointment-format';
import { isAppointmentState } from '../common/appointment-status';

// Cột `Thanh toán` của danh sách Quản trị viên (booking F12, UI-09; Figma `511:2`; Đại duyệt 14/11/2026, phương án 1). Dòng danh sách của B4 KHÔNG có `thanhToan` (module `payment` chưa có,
// PLAN L24, Q32), nên giá trị này là SUY LUẬN từ MÁY TRẠNG THÁI, KHÔNG phải bản ghi thanh toán: lịch chỉ rời `ChoThanhToan` khi cọc được xác nhận (hay khi cọc là 0đ), nên một lịch còn sống
// mà không ở `ChoThanhToan` và có `tienCoc` > 0 là "Đã đặt cọc". KHÔNG BAO GIỜ trả "Đã thanh toán đủ": cần dữ liệu thu tại quầy của `payment` (TECH_DEBT 146). Tiền là chuỗi decimal, chỉ hỏi
// "lớn hơn 0 không" (`isPositiveAmount`), không tính toán. Trạng thái lạ hay `DaHuy` ⇒ "không áp dụng" (không bịa nhãn).
export type PaymentSummary =
  'ChuaThanhToan' | 'DaDatCoc' | 'KhongCoc' | 'KhongApDung';

export function paymentSummary(
  trangThai: string,
  tienCoc: string,
): PaymentSummary {
  if (trangThai === 'ChoThanhToan') return 'ChuaThanhToan';
  if (!isAppointmentState(trangThai) || trangThai === 'DaHuy') {
    return 'KhongApDung';
  }
  return isPositiveAmount(tienCoc) ? 'DaDatCoc' : 'KhongCoc';
}
