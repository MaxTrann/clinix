// Mã lịch hẹn công khai `ma_lich_hen` (PLAN booking 5.11, Q13, H17; TRACKING 3.15 B2-C). Hàm THUẦN dùng chung cho mọi route có `:maLichHen` (B2, B3, B4, B5, B10,
// B12, B14) qua `ParseAppointmentCodePipe`; B8 thêm bộ sinh mã vào CÙNG file để một test chứng minh mã sinh ra luôn khớp mẫu.

/** `CLX-yyyyMMdd-XXXXX`: tiền tố, ngày (tám chữ số), năm ký tự Crockford base32 chữ hoa (bỏ I, L, O, U); 18 ký tự ≤ `varchar(20)`. `\d` của JS chỉ là 0-9. */
export const APPOINTMENT_CODE_PATTERN = /^CLX-\d{8}-[0-9A-HJKMNP-TV-Z]{5}$/;

/**
 * Cột `ma_lich_hen` có collation `utf8mb4_unicode_ci` (không phân biệt hoa thường, dấu, khoảng trắng cuối: M9) nên người dùng gõ chữ thường vẫn "tìm ra" nếu
 * không chuẩn hoá, còn `@Matches` không chuẩn hoá thì 400 (M8). Chuẩn hoá = cắt khoảng trắng hai đầu rồi đổi chữ thường `a-z` ASCII thành chữ hoa.
 * KHÔNG dùng `toUpperCase()` nguyên chuỗi: nó đổi `ſ` (U+017F) thành `S` và `ı` (U+0131) thành `I`, nên mã chứa hai ký tự đó lọt qua mẫu thành mã hợp lệ
 * (hai chuỗi khác nhau cùng trỏ một lịch hẹn).
 */
export function normalizeAppointmentCode(raw: string): string {
  return raw.trim().replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

/** Mã đã chuẩn hoá nếu đúng mẫu, ngược lại `null` (không phân biệt "sai dạng" với lý do khác: người gọi trả cùng một 404). */
export function parseAppointmentCode(raw: string): string | null {
  const code = normalizeAppointmentCode(raw);
  return APPOINTMENT_CODE_PATTERN.test(code) ? code : null;
}
