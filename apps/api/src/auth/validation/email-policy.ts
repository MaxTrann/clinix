// Chính sách email (S5, N9): chỉ ASCII, tối đa 255 ký tự (đúng `tai_khoan.email varchar(255)`).
// Các quy tắc chi tiết bên dưới (trim chỉ khoảng trắng ASCII, không nhận dấu nháy kép, dùng isEmail của validator.js)
// là [đề xuất] của AI chưa được nhóm duyệt, xem TRACKING.md mục 3 (A1-A).
import { isEmail } from 'class-validator';
import { trimAsciiWhitespace } from './ascii-text.js';

export const EMAIL_MAX_LENGTH = 255;
// Giới hạn của RFC 5321 cho phần trước `@`
export const EMAIL_LOCAL_PART_MAX_LENGTH = 64;

// ASCII in được, không dấu cách, và loại hẳn `"` và `\` để không nhận dạng "tên trong nháy kép"@... của RFC
const EMAIL_ALLOWED_CHARACTERS = /^[\x21\x23-\x5b\x5d-\x7e]+$/;

// Chuẩn hoá: cắt khoảng trắng ASCII hai đầu và viết THƯỜNG tên miền. Phần trước `@` giữ nguyên (DK-17):
// cột email dùng collation không phân biệt hoa/thường nên UNIQUE vẫn bắt được trùng.
export function normalizeEmail(raw: string): string {
  const trimmed = trimAsciiWhitespace(raw);
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return trimmed;
  // Chỉ hạ chữ A-Z. Không dùng toLowerCase() vì ký hiệu Kelvin (U+212A) bị đổi thành "k" ASCII, làm lọt ký tự lạ
  const domain = trimmed
    .slice(at + 1)
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return `${trimmed.slice(0, at + 1)}${domain}`;
}

// Kiểm email ĐÃ chuẩn hoá. validator.js lo định dạng (một dấu @, tên miền có TLD ≥ 2 chữ cái, mỗi nhãn ≤ 63,
// không IP, không tên hiển thị). Độ dài tự kiểm: `ignore_max_length` tắt giới hạn tổng 254 ký tự của thư viện, vì quy tắc
// của hệ thống là ≤ 255 (đúng cột varchar(255), DK-04) và 254 sẽ loại nhầm email dài đúng 255.
export function isValidEmail(email: string): boolean {
  return (
    email.length > 0 &&
    email.length <= EMAIL_MAX_LENGTH &&
    email.indexOf('@') <= EMAIL_LOCAL_PART_MAX_LENGTH &&
    EMAIL_ALLOWED_CHARACTERS.test(email) &&
    isEmail(email, {
      allow_utf8_local_part: false,
      require_tld: true,
      ignore_max_length: true,
    })
  );
}
