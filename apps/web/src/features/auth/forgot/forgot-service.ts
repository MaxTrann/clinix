import { LONG_TIMEOUT_MS, request } from '../../../shared/api/client';

// Bốn lời gọi của Quên mật khẩu (A11, A12). Cả bốn công khai: không gắn Authorization, không cookie.

// `forgot-password` và `resend-otp`: KHÔNG có OTP, KHÔNG có mã lần gửi
export interface ForgotCode {
  hetHanLuc: string;
  coTheGuiLaiLuc: string;
}

// `hetHanLuc` ở đây là hạn của TOKEN (10 phút từ lúc nhập đúng mã), không phải của mã
export interface ResetGrant {
  resetToken: string;
  hetHanLuc: string;
}

export interface ResetInput {
  resetToken: string;
  matKhauMoi: string;
  xacNhan: string;
}

export interface ResetResult {
  taiKhoanNgung: boolean;
  canDangKyLai: boolean;
}

// Hai lời gọi gửi thư dùng hạn dài (TECH_DEBT dòng 20). Không tự thử lại: máy chủ có thể đã gửi xong.
function sendCode(path: string, email: string): Promise<ForgotCode> {
  return request<ForgotCode>(path, {
    method: 'POST',
    json: { email },
    skipAuthToken: true,
    timeoutMs: LONG_TIMEOUT_MS,
  });
}

export function requestForgotCode(email: string): Promise<ForgotCode> {
  return sendCode('/auth/forgot-password', email);
}

// CÙNG một hàm với `forgot-password` ở API; mã trong thư cũ chết ngay khi mã mới gửi xong
export function resendForgotCode(email: string): Promise<ForgotCode> {
  return sendCode('/auth/forgot-password/resend-otp', email);
}

// Không có `maXacThucId`: API luôn xác minh mã đã gửi thành công mới nhất. `otp` là chuỗi vì số 0 đầu có nghĩa.
export function verifyForgotCode(
  email: string,
  otp: string,
): Promise<ResetGrant> {
  return request<ResetGrant>('/auth/forgot-password/verify-otp', {
    method: 'POST',
    json: { email, otp },
    skipAuthToken: true,
  });
}

// Chỉ ba trường: tài khoản lấy từ token, không gửi email hay mã tài khoản
export function resetPassword(input: ResetInput): Promise<ResetResult> {
  const { resetToken, matKhauMoi, xacNhan } = input;
  return request<ResetResult>('/auth/reset-password', {
    method: 'POST',
    json: { resetToken, matKhauMoi, xacNhan },
    skipAuthToken: true,
  });
}
