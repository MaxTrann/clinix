import { LONG_TIMEOUT_MS, request } from '../../../shared/api/client';

export interface RegisterInput {
  hoTen: string;
  email: string;
  soDienThoai: string;
  matKhau: string;
  xacNhan: string;
}

// `POST /auth/register` và `/resend-otp` trả cùng dạng. `maXacThucId` là chuỗi và đổi mỗi lần gửi.
export interface IssuedCode {
  maXacThucId: string;
  hetHanLuc: string;
  coTheGuiLaiLuc: string;
}

// Hai lời gọi gửi thư dùng hạn dài (TECH_DEBT dòng 20). Không tự thử lại: máy chủ có thể đã xử lý xong.
export function registerAccount(input: RegisterInput): Promise<IssuedCode> {
  return request<IssuedCode>('/auth/register', {
    method: 'POST',
    json: input,
    skipAuthToken: true,
    timeoutMs: LONG_TIMEOUT_MS,
  });
}

export function resendRegisterOtp(
  email: string,
  maXacThucId: string,
): Promise<IssuedCode> {
  return request<IssuedCode>('/auth/register/resend-otp', {
    method: 'POST',
    json: { email, maXacThucId },
    skipAuthToken: true,
    timeoutMs: LONG_TIMEOUT_MS,
  });
}

export function verifyRegisterOtp(
  email: string,
  maXacThucId: string,
  otp: string,
): Promise<{ daXacMinh: true }> {
  return request<{ daXacMinh: true }>('/auth/register/verify-otp', {
    method: 'POST',
    json: { email, maXacThucId, otp },
    skipAuthToken: true,
  });
}
