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

// MỘT dòng danh sách: ĐÚNG tám khoá của B5 (danh sách trắng; không giá, cọc, thanh toán, email, người đặt, tên bác sĩ, id). `thoiGian`: ISO 8601 UTC, hiển thị theo giờ Việt Nam. `lyDoKham` là chữ tự do
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

// Chi tiết: ĐÚNG mười một khoá = tám khoá của dòng cộng `ghiChuKham` (LUÔN `null` tới khi `doctor` có `ho_so_kham`: bộ đọc nhận đúng `null`), `chiNhanh` và `ngayDat` (ISO 8601 UTC). KHÔNG `lyDoHuy`.
export interface DoctorAppointmentDetail extends DoctorAppointment {
  ghiChuKham: null;
  chiNhanh: string;
  ngayDat: string;
}

// `{ items, total, page, pageSize, demTheoTrangThai }`: số đếm đủ sáu khoá, áp mọi bộ lọc TRỪ `trangThai[]`
export interface DoctorAppointmentPage {
  items: DoctorAppointment[];
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
