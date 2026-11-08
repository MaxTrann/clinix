// Kiểu dữ liệu hồ sơ cá nhân của trang "Hồ sơ người khám" (patient F3; PLAN patient 5.7, TRACKING F3-B, F3-C).

// Chi nhánh công tác (chỉ đọc) của Lễ tân, Bác sĩ hoặc Quản trị viên Chi nhánh (patient F4; TRACKING F4-D).
// `chiNhanhId` là chuỗi số BIGINT: không đổi qua `Number` (id lớn hơn 2^53 sẽ sai chữ số)
export interface ProfileBranch {
  chiNhanhId: string;
  ten: string;
}

// Sáu khoá của mọi vai trò, cộng `chiNhanh` (F4). GET /profile còn trả vaiTro, phamViQuanTri, anhDaiDien: F5 thêm
// `phamViQuanTri` vào kiểu này và vào `parseProfile` cùng cách (TRACKING patient mục 5).
export interface Profile {
  hoTen: string;
  email: string;
  soDienThoai: string;
  // Mã đã lưu (Nam, Nu, Khac), hoặc chuỗi lạ nếu ai đó sửa tay DB. Web không đoán: chỉ hiển thị qua `genderLabel`
  gioiTinh: string | null;
  // YYYY-MM-DD (chuỗi, không phải Date: tránh lệch múi giờ)
  ngaySinh: string | null;
  diaChi: string | null;
  // Chỉ có khi API trả chi nhánh. API bảo đảm khoá này có ở Lễ tân và Bác sĩ (thiếu hàng chi nhánh thì API trả 500, không trả null);
  // Bệnh nhân không có chi nhánh nên khoá vắng mặt. Thiếu ở Lễ tân là hợp đồng lệch, trang vẫn không vỡ (hiện "Chưa cập nhật").
  chiNhanh?: ProfileBranch;
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
