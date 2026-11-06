// Kiểu dữ liệu hồ sơ cá nhân của trang "Hồ sơ người khám" (patient F3; PLAN patient 5.7, TRACKING F3-B, F3-C).

// SÁU khoá mà trang vẽ ra. GET /profile còn trả vaiTro, chiNhanh, phamViQuanTri, anhDaiDien: F4 thêm `chiNhanh`, F5 thêm
// `phamViQuanTri` vào kiểu này và vào `parseProfile` khi làm (TRACKING patient mục 5).
export interface Profile {
  hoTen: string;
  email: string;
  soDienThoai: string;
  // Mã đã lưu (Nam, Nu, Khac), hoặc chuỗi lạ nếu ai đó sửa tay DB. Web không đoán: chỉ hiển thị qua `genderLabel`
  gioiTinh: string | null;
  // YYYY-MM-DD (chuỗi, không phải Date: tránh lệch múi giờ)
  ngaySinh: string | null;
  diaChi: string | null;
}

// Thân PUT /profile: ĐÚNG năm khoá, PUT thay cả bộ. `email` và mọi khoá khác bị API từ chối (400 TRUONG_KHONG_DUOC_PHEP).
export interface ProfileUpdate {
  hoTen: string;
  soDienThoai: string;
  gioiTinh: string | null;
  ngaySinh: string | null;
  diaChi: string | null;
}

// Giá trị các ô của form, luôn là chuỗi (đúng thứ cái người dùng gõ): ngày ở dạng dd/mm/yyyy, giới tính là mã hoặc '' (chưa chọn)
export interface ProfileFormValues {
  hoTen: string;
  soDienThoai: string;
  gioiTinh: string;
  ngaySinh: string;
  diaChi: string;
}
