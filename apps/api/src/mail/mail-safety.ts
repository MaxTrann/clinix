// Kiểm an toàn trước khi dựng thư. Lý do (đã chạy thật với nodemailer 10.2.1, xem docs/features/auth/TRACKING.md P4-C):
// nodemailer tự vô hiệu CRLF trong tiêu đề và tên người gửi, nhưng KHÔNG bảo vệ trường người nhận: "a@x\r\nBcc: evil@x"
// làm người nhận thật thành evil@x, và dấu phẩy hay chấm phẩy tạo thêm người nhận. Một OTP gửi nhầm địa chỉ là lộ tài khoản,
// nên mail tự kiểm, không dựa vào bộ phân tích địa chỉ của thư viện.
//
// Đây là lớp phòng thủ THỨ HAI. Người gọi vẫn phải chuẩn hoá và kiểm email bằng chính sách của auth (A1). Cố ý KHÔNG import A1 vào
// đây (mail không phụ thuộc auth); test mail-recipient.a1-parity.spec.ts bảo đảm mọi email A1 chấp nhận đều qua được kiểm này.

// 255 và 64 giống EMAIL_MAX_LENGTH / EMAIL_LOCAL_PART_MAX_LENGTH của A1 (cột tai_khoan.email là varchar(255)).
// Nếu ở đây chặt hơn A1 thì sẽ có tài khoản hợp lệ không bao giờ nhận được OTP.
export const MAIL_ADDRESS_MAX_LENGTH = 255;
export const MAIL_LOCAL_PART_MAX_LENGTH = 64;
export const MAIL_SUBJECT_MAX_LENGTH = 200;
export const MAIL_TEXT_MAX_LENGTH = 10_000;

// Chỉ ASCII in được (0x21–0x7e): loại dấu cách, ký tự điều khiển, DEL và mọi ký tự ngoài ASCII.
// Rồi loại ký tự có nghĩa cấu trúc trong địa chỉ: , ; : < > ( ) [ ] " \  (phân tách người nhận, tên hiển thị, nhóm, chú thích).
const UNSAFE_ADDRESS_CHARACTER = /[^\x21-\x7e]|[,;:<>()[\]"\\]/;
// Ký tự điều khiển (C0, DEL, C1 gồm cả NEL) và dấu ngắt dòng/đoạn Unicode: không bao giờ được nằm trong một giá trị header.
export const CONTROL_OR_LINE_BREAK = /[\p{Cc}\p{Zl}\p{Zp}]/u; // \p{Cc} điều khiển, \p{Zl} U+2028, \p{Zp} U+2029 (không liệt kê mã để khỏi vướng quy tắc no-control-regex)

/** Đúng MỘT địa chỉ email thô (không tên hiển thị, không danh sách), đủ an toàn để đưa vào phong bì SMTP. */
export function isSafeMailAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length < 3 || value.length > MAIL_ADDRESS_MAX_LENGTH) return false;
  if (UNSAFE_ADDRESS_CHARACTER.test(value)) return false;
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@')) return false;
  if (at > MAIL_LOCAL_PART_MAX_LENGTH) return false;
  return at < value.length - 1;
}

/** Một dòng, không ký tự điều khiển: dùng cho tiêu đề và tên hiển thị người gửi. */
export function isSafeHeaderText(value: unknown, maxLength: number): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !CONTROL_OR_LINE_BREAK.test(value)
  );
}

/** Nội dung thư: được xuống dòng, chỉ cấm NUL và giới hạn độ dài. */
export function isSafeBodyText(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAIL_TEXT_MAX_LENGTH &&
    !value.includes('\u0000')
  );
}

/**
 * Đưa dữ liệu người dùng nhập (ví dụ họ tên) về MỘT dòng trước khi chèn vào thân thư: gộp khoảng trắng và xuống dòng thành một
 * dấu cách, cắt độ dài. Để một họ tên độc hại không dựng được dòng giả như "mã của bạn là 000000" trong thư.
 */
export function toSingleLine(value: string, maxLength = 100): string {
  return value
    .replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ')
    .trim()
    .slice(0, maxLength);
}
