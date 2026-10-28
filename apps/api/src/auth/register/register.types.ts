// Đầu vào và kết quả của đăng ký (task A5).

/** Dữ liệu một lần đăng ký, ĐÃ chuẩn hoá bởi DTO (email, SĐT, họ tên). Không có trường xác nhận mật khẩu: nó chỉ để đối chiếu ở DTO. */
export interface RegisterInput {
  hoTen: string;
  email: string;
  soDienThoai: string;
  /** Mật khẩu rõ: chỉ sống đến khi băm xong, không bao giờ được lưu, log hay đưa vào lỗi */
  matKhau: string;
}

/** Phản hồi thành công của POST /auth/register: KHÔNG bao giờ có OTP, email, băm hay mã tài khoản. */
export interface RegisterResult {
  /** Mã lần gửi: client giữ để nhập mã (verify-otp) và "Gửi lại mã" (resend-otp) ở A6 */
  maXacThucId: string;
  hetHanLuc: Date;
  /** Thời điểm sớm nhất bấm "Gửi lại mã" được (60 giây sau khi cấp mã): FE đếm ngược theo mốc này */
  coTheGuiLaiLuc: Date;
}
