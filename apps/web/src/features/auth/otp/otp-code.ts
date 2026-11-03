export const OTP_LENGTH = 6;

// Chỉ mã đủ 6 chữ số mới được gửi; `otp` luôn là chuỗi vì số 0 đứng đầu có nghĩa
export function isCompleteOtp(value: string): boolean {
  return new RegExp(`^[0-9]{${OTP_LENGTH}}$`).test(value);
}
