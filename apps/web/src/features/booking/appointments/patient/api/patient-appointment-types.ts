import type { AppointmentState } from '../../common/appointment-status';

// Kiểu dữ liệu của "Lịch hẹn của tôi" (booking F1; hợp đồng `GET /patient/appointments` ở PLAN 5.9, TRACKING 3.13.2).

// MỘT dòng danh sách: ĐÚNG mười hai khoá của B1 (danh sách trắng; `lich_hen_id`, `benh_nhan_id`, email, SĐT… không bao giờ có). Bộ đọc giữ đủ
// mười hai khoá (F2, F8… dùng lại một phần) và bỏ khoá thừa. Figma `411:2` chỉ vẽ sáu khoá của danh sách; chi tiết là việc của F2.
export interface PatientAppointment {
  maLichHen: string;
  // Mã trạng thái. Chỉ sáu mã trong `APPOINTMENT_STATES` có nhãn; mã lạ vẫn đi qua và hiện "Chưa xác định" (appointmentStateLabel)
  trangThai: string;
  // ISO 8601 UTC: hiển thị qua `formatVietnam*`, không bao giờ theo múi giờ của máy
  thoiGian: string;
  // Chỉ họ tên và tên: API không trả chức danh bác sĩ hay quan hệ của người thân (TRACKING 3.25 F1-D (4))
  bacSi: string;
  chuyenKhoa: string;
  chiNhanh: string;
  dichVu: string;
  nguoiKham: { hoTen: string; laBanThan: boolean };
  // Chuỗi decimal ("300000.00"), chỉ để hiển thị qua `formatVnd`; không tính toán trên số thực
  giaSnapshot: string;
  tienCoc: string;
  hanThanhToan: string | null;
  choPhepHuy: boolean;
}

// Số lịch theo từng trạng thái: đủ sáu khoá, áp mọi bộ lọc TRỪ `trangThai[]` (B1), không có `DaDoiLich`. KHÔNG tự đếm lại từ `items`.
export type StatusCounts = Record<AppointmentState, number>;

export interface PatientAppointmentPage {
  items: PatientAppointment[];
  total: number;
  page: number;
  pageSize: number;
  demTheoTrangThai: StatusCounts;
}

// Giá trị `hoSoNguoiThanId` cho "bản thân" (B1: `BanThan` đúng chữ ⇒ lịch của chính Bệnh nhân)
export const OWN_PROFILE = 'BanThan';

// Bộ lọc và trang của một lần tải. Mọi bộ lọc tuỳ chọn; giá trị rỗng không được gửi (B1 trả 400 với `q=` rỗng). Ngày là chuỗi `YYYY-MM-DD`
// (ngày Việt Nam, không qua `Date`). Không có `nhom` (không thêm Sắp tới/Lịch sử vào giao diện, Đại duyệt 12/11/2026) và không có `pageSize`
// (dùng mặc định 20 của máy chủ, đếm trang theo `pageSize` trả về).
export interface AppointmentListQuery {
  trangThai?: AppointmentState;
  hoSoNguoiThanId?: string;
  bacSiId?: string;
  chuyenKhoaId?: string;
  tuNgay?: string;
  denNgay?: string;
  q?: string;
  page: number;
}

// Các lựa chọn của bộ lọc. Id là chuỗi (BIGINT). Danh sách bác sĩ và chuyên khoa lấy một trang tối đa 100 mục: `truncated` = còn mục chưa lấy được
// (`total` lớn hơn số mục nhận), để giao diện ghi "danh sách rút gọn" thay vì cắt âm thầm.
export interface RelativeOption {
  hoSoNguoiThanId: string;
  hoTen: string;
  // false = hồ sơ đã ngừng sử dụng (vẫn có thể có lịch trong lịch sử nên vẫn là một lựa chọn)
  trangThaiHieuLuc: boolean;
}

export interface SpecialtyOption {
  chuyenKhoaId: string;
  ten: string;
}

export interface DoctorOption {
  bacSiId: string;
  hoTen: string;
}

export interface OptionList<T> {
  options: T[];
  truncated: boolean;
}
