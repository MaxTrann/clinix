import {
  bookingDonePath,
  bookingPaymentPath,
} from '../../../../shared/routes/booking-paths';
import type { CreatedAppointment } from '../../api/booking-types';

// Đích sau khi tạo lịch hẹn thành công (booking F5; PLAN 5.13, TRACKING 3.34 F5-I). Quyết theo `canThanhToan` của 201: MỘT tín hiệu duy nhất của máy chủ, KHÔNG so `tienCoc` ở
// client (bộ đọc đã bảo đảm `canThanhToan` khớp `trangThai`).
//   canThanhToan false  lịch `DaXacNhan` ngay (cọc 0đ) ⇒ Bước 6 "Hoàn tất"
//   canThanhToan true   lịch `ChoThanhToan` (cọc > 0) ⇒ Bước "Thanh toán" (F6; tới khi F6 xong là thân tạm của F3, Đại duyệt 13/11/2026 (f1))
// Cả hai trang đích tải dữ liệu từ `GET /patient/appointments/:maLichHen` theo mã trên đường dẫn: bản nháp đã bị xoá, không có gì đi qua context.
export function destinationAfterCreate(created: CreatedAppointment): string {
  return created.canThanhToan
    ? bookingPaymentPath(created.maLichHen)
    : bookingDonePath(created.maLichHen);
}
