import type { PhamViQuanTri } from '../../admin/entities/enums.js';
import type { LoaiTaiKhoan } from '../../auth/entities/enums.js';

/** Chi nhánh công tác (chỉ đọc) của Bác sĩ, Lễ tân hoặc Quản trị viên Chi nhánh. `chiNhanhId` là chuỗi số (bigint). */
export interface ProfileBranch {
  chiNhanhId: string;
  ten: string;
}

/**
 * Thân phản hồi `GET /profile` (task B1; PLAN patient 5.7; TRACKING B1-C): ĐÚNG 10 khoá này (danh sách trắng).
 * Không có băm mật khẩu, khoá đăng nhập, trạng thái, ví hay mã tài khoản. `anhDaiDien` luôn `null` (Q4: ảnh đại diện hoãn).
 * Task B2 thêm DTO đầu vào của `PUT /profile` vào file này.
 */
export interface ProfileResponse {
  hoTen: string;
  email: string;
  soDienThoai: string;
  /** Chuỗi đã lưu, không kiểm và không đổi (DB không ràng buộc tập giá trị; mã chuẩn `Nam`/`Nu`/`Khac` do B2 ép khi ghi) */
  gioiTinh: string | null;
  /** `YYYY-MM-DD` hoặc `null` */
  ngaySinh: string | null;
  diaChi: string | null;
  anhDaiDien: null;
  vaiTro: LoaiTaiKhoan;
  chiNhanh: ProfileBranch | null;
  phamViQuanTri: PhamViQuanTri | null;
}
