import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { OTP_LENGTH } from '../auth.constants.js';
import type { OtpLoai } from './otp.types.js';

// Sinh mã, băm và so mã OTP (quyết định S3). Hàm thuần, không đụng DB.

const HEX_SHA256 = /^[0-9a-f]{64}$/;
const OTP_FORMAT = new RegExp(`^[0-9]{${String(OTP_LENGTH)}}$`);

/** Mã OTP 6 chữ số, sinh bằng bộ sinh số ngẫu nhiên an toàn của Node (có thể bắt đầu bằng 0). */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

/** Mã người dùng nhập có đúng dạng 6 chữ số ASCII không (dạng sai thì chắc chắn không khớp, không cần băm). */
export function isOtpFormat(value: string): boolean {
  return OTP_FORMAT.test(value);
}

export interface OtpHashInput {
  taiKhoanId: string;
  loai: OtpLoai;
  maXacThucId: string;
  code: string;
}

// HMAC-SHA-256 với khoá riêng. Dữ liệu băm gồm mã tài khoản, loại, mã lần gửi (ma_xac_thuc_id) và mã (PLAN 5.2, quy tắc 17):
// nhờ vậy băm của hàng này không dùng được cho hàng khác dù trùng mã, và kẻ đọc được DB nhưng không có khoá thì không dò ngược được
// (không gian mã chỉ 10^6). Phân tách bằng "|": ba trường đầu là số và tên enum nên không có nhập nhằng.
export function hashOtp(key: Buffer, input: OtpHashInput): string {
  return createHmac('sha256', key)
    .update(
      `${input.taiKhoanId}|${input.loai}|${input.maXacThucId}|${input.code}`,
    )
    .digest('hex');
}

/**
 * So mã người dùng nhập với băm đã lưu bằng `timingSafeEqual` trên hai buffer CÙNG độ dài (32 byte).
 * `timingSafeEqual` ném RangeError khi hai buffer khác độ dài, nên độ dài được kiểm TRƯỚC và trả false (không ném, không lộ gì):
 * băm hợp lệ luôn dài đúng 32 byte nên độ dài không phải bí mật; chuỗi lưu hỏng hoặc còn là giá trị tạm thì chỉ là "không khớp".
 */
export function otpMatches(
  storedHex: string,
  key: Buffer,
  input: OtpHashInput,
): boolean {
  const expected = Buffer.from(hashOtp(key, input), 'hex');
  if (!HEX_SHA256.test(storedHex)) return false;
  const stored = Buffer.from(storedHex, 'hex');
  if (stored.length !== expected.length) return false;
  return timingSafeEqual(stored, expected);
}
