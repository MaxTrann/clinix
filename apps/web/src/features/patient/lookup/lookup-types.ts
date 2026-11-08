// Kiểu dữ liệu của trang "Tra cứu bệnh nhân" (patient F8; PLAN patient 5.7, TRACKING F8-D). Hợp đồng thật ở TRACKING mục 5 (dòng `patient` F8).
// Mọi mã (`trangThai`, `gioiTinh`, `moiQuanHe`) là chuỗi: mã lạ không làm vỡ trang, nhãn do các hàm ở `lookup-labels.ts` và F3, F6 lo.

// Một dòng của danh sách: ĐÚNG năm khoá API trả (B6). `taiKhoanId` là chuỗi số BIGINT (không qua `Number`: id lớn hơn 2^53 sẽ sai
// chữ số), chỉ để mở chi tiết, KHÔNG hiển thị.
export interface PatientSummary {
  taiKhoanId: string;
  hoTen: string;
  soDienThoai: string;
  email: string;
  // Mã (`DangHoatDong`, `NgungHoatDong`); chỉ `NgungHoatDong` có nhãn
  trangThai: string;
}

export interface PatientSearchPage {
  items: PatientSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// Một người thân trong chi tiết (B7): ĐÚNG sáu khoá, không có mã nội bộ nên danh sách dùng chỉ số mảng làm `key`
export interface PatientDetailRelative {
  hoTen: string;
  moiQuanHe: string;
  gioiTinh: string;
  // YYYY-MM-DD (chuỗi, không phải Date: tránh lệch múi giờ)
  ngaySinh: string;
  soDienThoai: string | null;
  trangThaiHieuLuc: boolean;
}

// Chi tiết một bệnh nhân (B7): đúng mười khoá. `thoiDiemTao` là ISO 8601 UTC: hiển thị theo NGÀY giờ Việt Nam (`formatVietnamDate`).
export interface PatientDetail {
  hoTen: string;
  email: string;
  soDienThoai: string;
  gioiTinh: string | null;
  ngaySinh: string | null;
  diaChi: string | null;
  thoiDiemTao: string;
  trangThai: string;
  soLanVangMat: number;
  nguoiThan: PatientDetailRelative[];
}
