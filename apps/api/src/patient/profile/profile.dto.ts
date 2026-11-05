import type { PhamViQuanTri } from '../../admin/entities/enums.js';
import {
  IsAccountFullName,
  IsAccountPhone,
} from '../../auth/dto/account-field.decorators.js';
import type { LoaiTaiKhoan } from '../../auth/entities/enums.js';
import {
  IsAddress,
  IsBirthDate,
  IsGender,
} from '../validation/patient-field.decorators.js';

/** Chi nhánh công tác (chỉ đọc) của Bác sĩ, Lễ tân hoặc Quản trị viên Chi nhánh. `chiNhanhId` là chuỗi số (bigint). */
export interface ProfileBranch {
  chiNhanhId: string;
  ten: string;
}

/**
 * Thân phản hồi `GET /profile` (task B1; PLAN patient 5.7; TRACKING B1-C): ĐÚNG 10 khoá này (danh sách trắng).
 * Không có băm mật khẩu, khoá đăng nhập, trạng thái, ví hay mã tài khoản. `anhDaiDien` luôn `null` (Q4: ảnh đại diện hoãn).
 * DTO đầu vào của `PUT /profile` (`UpdateProfileDto`, task B2) nằm ngay dưới.
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

/**
 * Thân của `PUT /profile` (task B2; PLAN patient 5.2, 5.7, 5.8; TRACKING B2-B): CHỈ năm trường. `email`, ảnh, CCCD và mọi trường lạ bị
 * `whitelist` + `forbidNonWhitelisted` của configureApp từ chối (TRUONG_KHONG_DUOC_PHEP); tài khoản lấy từ access token, không bao giờ từ thân.
 * PUT thay CẢ BỘ: thiếu khoá là lỗi của trường đó (không phải "giữ nguyên"). Chuẩn hoá (NFC, cắt khoảng trắng, SĐT 10 số liền, địa chỉ rỗng ⇒ null)
 * do decorator làm lúc chuyển thân thành DTO; service và repository không chuẩn hoá lại. Mã lỗi nằm ở `message` của decorator (mã ổn định).
 * Hai kiểu trường (TRACKING P1-D): bắt buộc không null (`hoTen`, `soDienThoai`) và bắt buộc có khoá nhưng được `null` (ba trường còn lại, `null` = xoá).
 */
export class UpdateProfileDto {
  @IsAccountFullName()
  hoTen!: string;

  @IsAccountPhone()
  soDienThoai!: string;

  @IsGender({ nullable: true })
  gioiTinh!: string | null;

  @IsBirthDate({ nullable: true })
  ngaySinh!: string | null;

  @IsAddress()
  diaChi!: string | null;
}
