import type { AppointmentState } from '../../common/appointment-status';
import type { StatusCounts } from '../../common/status-counts';

// Kiểu dữ liệu của "Lịch hẹn" của Bác sĩ (booking F11; hợp đồng `GET /doctor/appointments` ở PLAN 5.8, 5.9, TRACKING 3.20.1).

// Ca khám của lịch (`lich_lam_viec.ca`): ba giá trị của `CA_LAM_VIEC`. Là MỘT giá trị khi lọc (B5: mảng hay giá trị lạ ⇒ 400).
export const SHIFT_CODES = ['CaSang', 'CaChieu', 'CaToi'] as const;
export type ShiftCode = (typeof SHIFT_CODES)[number];

// `sapXep` của B5: `MoiNhat` (mặc định, `thoi_gian` giảm dần) hoặc `CuNhat`
export const SORT_ORDERS = ['MoiNhat', 'CuNhat'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

// Người được khám (KHÔNG phải người đặt): `quanHe` là `BanThan` hoặc giá trị thô của `moi_quan_he` (giao diện đặt nhãn); `gioiTinh`, `ngaySinh` (`YYYY-MM-DD`), `soDienThoai` là của NGƯỜI KHÁM và
// có thể `null` (chưa nhập; người thân không có SĐT thì KHÔNG thay bằng SĐT người đặt).
export interface DoctorExaminee {
  hoTen: string;
  quanHe: string;
  gioiTinh: string | null;
  ngaySinh: string | null;
  soDienThoai: string | null;
}

// Tám khoá LÕI của một lịch (dòng danh sách thêm `coHoSoKham`, chi tiết thêm ba khoá khác): ĐÚNG tám khoá của B5 (danh sách trắng; không giá, cọc, thanh toán, email, người đặt, tên bác sĩ, id). `thoiGian`: ISO 8601 UTC, hiển thị theo giờ Việt Nam. `lyDoKham` là chữ tự do
// của bệnh nhân (dữ liệu sức khoẻ riêng tư). `ca` và `trangThai` giữ mã thô: mã lạ vẫn đi qua và được che ở chỗ hiển thị.
export interface DoctorAppointment {
  maLichHen: string;
  thoiGian: string;
  ca: string;
  trangThai: string;
  nguoiKham: DoctorExaminee;
  dichVu: string;
  chuyenKhoa: string;
  lyDoKham: string | null;
}

// MỘT dòng của DANH SÁCH: ĐÚNG chín khoá = tám khoá lõi cộng `coHoSoKham` (doctor-exam B3, Q24; F4 đọc). `true` khi lịch ở `DaTiepDon`/`HoanThanh` VÀ đã có hồ sơ khám; KHÔNG có nội dung hồ sơ. Chi tiết KHÔNG có khoá này
// (cờ chỉ của danh sách) nên dùng `DoctorAppointment`. Giao diện chỉ hiện nhãn ở `HoanThanh` (Q6 (4)); cờ do máy chủ tính, web không suy ra.
export interface DoctorAppointmentRow extends DoctorAppointment {
  coHoSoKham: boolean;
}

// Hồ sơ khám của lịch (doctor-exam F2; hình dạng nguồn `ExamRecordView` của B2, B3 trả ở `ghiChuKham`): ĐÚNG năm khoá. `ngayTaiKhamDuKien` là `YYYY-MM-DD` hoặc `null` (tuỳ chọn), `capNhatLanCuoi` là ISO 8601 UTC.
export interface DoctorExamRecord {
  trieuChung: string;
  chanDoanSoBo: string;
  huongXuLy: string;
  ngayTaiKhamDuKien: string | null;
  capNhatLanCuoi: string;
}

// Chi tiết: ĐÚNG mười một khoá = tám khoá của dòng cộng `ghiChuKham` (`null` khi chưa có hồ sơ hoặc lịch không ở `DaTiepDon`/`HoanThanh` (Q16); khác `null` là đối tượng `DoctorExamRecord`, bộ đọc kiểm hình dạng), `chiNhanh` và `ngayDat` (ISO 8601 UTC). KHÔNG `lyDoHuy`.
export interface DoctorAppointmentDetail extends DoctorAppointment {
  ghiChuKham: DoctorExamRecord | null;
  chiNhanh: string;
  ngayDat: string;
}

// `{ items, total, page, pageSize, demTheoTrangThai }`: số đếm đủ sáu khoá, áp mọi bộ lọc TRỪ `trangThai[]`
export interface DoctorAppointmentPage {
  items: DoctorAppointmentRow[];
  total: number;
  page: number;
  pageSize: number;
  demTheoTrangThai: StatusCounts;
}

// Bộ lọc và trang của một lần tải. Mọi bộ lọc tuỳ chọn; giá trị rỗng không được gửi (B5 trả 400 với `q=` rỗng). Ngày là chuỗi `YYYY-MM-DD` (ngày Việt Nam, không qua `Date`). KHÔNG có `bacSiId`
// (phạm vi là chính bác sĩ, backend lấy từ access token), `chiNhanhId`, `chuyenKhoaId` và `pageSize` (dùng mặc định 20 của máy chủ, đếm trang theo `pageSize` trả về): kiểu này không cho phép gửi chúng.
export interface DoctorListQuery {
  trangThai?: AppointmentState;
  ca?: ShiftCode;
  tuNgay?: string;
  denNgay?: string;
  q?: string;
  sapXep?: SortOrder;
  page: number;
}
