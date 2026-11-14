import { type AppointmentState } from './appointment-status';
import { readCount, readRecord } from './response-readers';

// Số lịch theo từng trạng thái ở thẻ lọc có số đếm (booking F1 viết trong `patient/`, chuyển lên `common/` ở F11: Bệnh nhân và Bác sĩ cùng dùng).
// Đủ sáu khoá, áp mọi bộ lọc TRỪ `trangThai[]` (B1, B5), không có `DaDoiLich`. KHÔNG tự đếm lại từ `items`.
export type StatusCounts = Record<AppointmentState, number>;

// Viết từng khoá (thêm một trạng thái vào `APPOINTMENT_STATES` thì `tsc` báo thiếu khoá ở đây). Khoá thừa, như `DaDoiLich`, bị bỏ; thiếu khoá hay sai kiểu ⇒ phản hồi không dùng được.
export function parseStatusCounts(raw: unknown): StatusCounts {
  const counts = readRecord(raw);
  return {
    ChoThanhToan: readCount(counts.ChoThanhToan),
    DaXacNhan: readCount(counts.DaXacNhan),
    DaTiepDon: readCount(counts.DaTiepDon),
    HoanThanh: readCount(counts.HoanThanh),
    DaHuy: readCount(counts.DaHuy),
    VangMat: readCount(counts.VangMat),
  };
}
