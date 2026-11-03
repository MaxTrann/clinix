// Chép từ apps/api/src/auth/validation/ (ascii-text, full-name-policy, phone-policy, email-policy; TECH_DEBT dòng 55).

const FULL_NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 255;
const EMAIL_LOCAL_PART_MAX_LENGTH = 64;

const FORBIDDEN_IN_NAME = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;
const HAS_LETTER = /\p{L}/u;
const PHONE_WITH_SEPARATORS = /^[0-9]+(?:[ .][0-9]+)*$/;
const VIETNAM_PHONE = /^0[0-9]{9}$/;
const EMAIL_ALLOWED_CHARACTERS = /^[\x21\x23-\x5b\x5d-\x7e]+$/;

// Chỉ khoảng trắng ASCII: `String.trim()` còn cắt U+00A0, khiến FE nhận thứ API từ chối
export function trimAsciiWhitespace(text: string): string {
  return text.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '');
}

export function isValidFullName(raw: string): boolean {
  const name = trimAsciiWhitespace(raw.normalize('NFC'));
  // Array.from đếm theo điểm mã như MySQL, `.length` đếm đơn vị UTF-16 nên chữ ngoài mặt phẳng cơ bản bị tính đôi
  return (
    HAS_LETTER.test(name) &&
    !FORBIDDEN_IN_NAME.test(name) &&
    Array.from(name).length <= FULL_NAME_MAX_LENGTH
  );
}

export function isValidPhone(raw: string): boolean {
  const trimmed = trimAsciiWhitespace(raw);
  return (
    PHONE_WITH_SEPARATORS.test(trimmed) &&
    VIETNAM_PHONE.test(trimmed.replace(/[ .]/g, ''))
  );
}

// Phần kiểm chắc chắn. Chi tiết của `isEmail` để API quyết (`web` không có `validator`), và FE không được chặn thứ API nhận.
export function isPlausibleEmail(raw: string): boolean {
  const email = trimAsciiWhitespace(raw);
  const at = email.lastIndexOf('@');
  return (
    email.length <= EMAIL_MAX_LENGTH &&
    EMAIL_ALLOWED_CHARACTERS.test(email) &&
    at > 0 &&
    at <= EMAIL_LOCAL_PART_MAX_LENGTH &&
    email.slice(at + 1).includes('.')
  );
}
