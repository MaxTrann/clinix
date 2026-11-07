// Kiểu dữ liệu hồ sơ người thân (patient F6; PLAN patient 5.7, TRACKING F6-B, F6-C).

// BẢY khoá của một phần tử `GET /patient/relatives` (cũng là phản hồi 201 của POST và 200 của PUT). Không có `diaChi`, `benhNhanId` (Q8).
export interface Relative {
  // BIGINT dạng chuỗi (có thể vượt 2^53): không bao giờ `Number`, `parseInt`
  hoSoNguoiThanId: string;
  hoTen: string;
  // Mã `Cha`, `Me`, `Vo`, `Chong`, `Con`, `AnhChiEm`, `OngBa`, `Khac`, hoặc chuỗi lạ nếu ai đó sửa tay DB: web không đoán, chỉ hiển thị qua `relationshipLabel`
  moiQuanHe: string;
  // Mã `Nam`, `Nu`, `Khac`, hoặc chuỗi lạ (DB không có CHECK): chỉ hiển thị qua `genderLabel`
  gioiTinh: string;
  // YYYY-MM-DD (chuỗi, không phải Date: tránh lệch múi giờ)
  ngaySinh: string;
  soDienThoai: string | null;
  trangThaiHieuLuc: boolean;
}

// Thân POST và PUT: ĐÚNG năm khoá, PUT thay cả bộ (thiếu `soDienThoai` là xoá SĐT; web luôn gửi `null` hoặc chuỗi)
export interface RelativePayload {
  hoTen: string;
  moiQuanHe: string;
  gioiTinh: string;
  // null chỉ khi ô chưa qua `validateRelativeForm` (đã kiểm thì luôn là chuỗi YYYY-MM-DD)
  ngaySinh: string | null;
  soDienThoai: string | null;
}

// Giá trị các ô của form, luôn là chuỗi: ngày ở dạng dd/mm/yyyy, quan hệ và giới tính là mã hoặc '' (chưa chọn)
export interface RelativeFormValues {
  hoTen: string;
  moiQuanHe: string;
  gioiTinh: string;
  ngaySinh: string;
  soDienThoai: string;
}

// ĐÚNG năm khoá của một phần tử `chiTiet` trong 409 `HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN` (patient F7; B5, PLAN 5.7, Q11). Khoá khác bị bỏ khi đọc.
export interface BlockingAppointment {
  maLichHen: string;
  // ISO 8601 UTC: hiển thị qua `formatVietnamDateTime`, không bao giờ qua múi giờ của máy
  thoiGian: string;
  // Mã `ChoThanhToan`, `DaXacNhan`, `DaTiepDon` hoặc chuỗi lạ: chỉ hiển thị qua `appointmentStatusLabel`
  trangThai: string;
  bacSi: string;
  chiNhanh: string;
}

// Kết quả của `POST /patient/relatives/:id/deactivate` mà web xử lý như một kết quả bình thường (không phải lỗi): đã ngừng, hoặc bị lịch hẹn chặn
export type DeactivateOutcome =
  { kind: 'done' } | { kind: 'blocked'; appointments: BlockingAppointment[] };
