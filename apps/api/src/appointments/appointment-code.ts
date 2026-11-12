import { randomInt } from 'node:crypto';
import { todayVN } from '../common/time/time.js';

// Mã lịch hẹn công khai `ma_lich_hen` (PLAN booking 5.11, Q13, H17; TRACKING 3.15 B2-C). Hàm THUẦN dùng chung cho mọi route có `:maLichHen` (B2, B3, B4, B5, B10,
// B12, B14) qua `ParseAppointmentCodePipe`; B8 (TRACKING 3.21, câu (d)) thêm bộ sinh mã vào CÙNG file để một test chứng minh mã sinh ra luôn khớp mẫu.

/** `CLX-yyyyMMdd-XXXXX`: tiền tố, ngày (tám chữ số), năm ký tự Crockford base32 chữ hoa (bỏ I, L, O, U); 18 ký tự ≤ `varchar(20)`. `\d` của JS chỉ là 0-9. */
export const APPOINTMENT_CODE_PATTERN = /^CLX-\d{8}-[0-9A-HJKMNP-TV-Z]{5}$/;

// Bảng Crockford base32 (32 ký tự, KHÔNG có I, L, O, U): cùng tập với lớp ký tự của APPOINTMENT_CODE_PATTERN. Một chỗ định nghĩa; test TAO-01 khẳng định hai bên khớp nhau.
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const APPOINTMENT_CODE_SUFFIX_LENGTH = 5;

/** Bộ sinh phần đuôi: trả ĐÚNG `length` ký tự Crockford. Tách ra để test thay bằng bộ sinh có kịch bản (ép va chạm 1062); bản chạy thật là `randomCodeSuffix`. */
export type CodeSuffixSource = (length: number) => string;

/** Token DI của bộ sinh phần đuôi (`AppointmentsModule` khai `useValue: randomCodeSuffix`; test dùng `overrideProvider`). */
export const APPOINTMENT_CODE_RANDOM = Symbol('APPOINTMENT_CODE_RANDOM');

/** Phần đuôi ngẫu nhiên từ `crypto.randomInt` (CSPRNG, Q13): mỗi ký tự được chọn đều trong 32 ký tự, không lệch (khác `% 32` trên byte). */
export const randomCodeSuffix: CodeSuffixSource = (length) => {
  let suffix = '';
  for (let index = 0; index < length; index += 1)
    suffix += CROCKFORD_ALPHABET.charAt(randomInt(CROCKFORD_ALPHABET.length));
  return suffix;
};

/**
 * `CLX-` + ngày lịch Việt Nam của `now` (`todayVN`, không phải ngày UTC: 17:30 UTC đã là ngày hôm sau ở Việt Nam) + `-` + phần đuôi từ `random`. Hàm thuần: không đọc đồng hồ, không đổi `now`.
 * Kết quả LUÔN khớp `APPOINTMENT_CODE_PATTERN`: bộ sinh trả sai độ dài hay ký tự cấm thì NÉM lỗi thay vì ghi một mã mà `ParseAppointmentCodePipe` sẽ từ chối là 404 mãi mãi.
 */
export function generateAppointmentCode(
  now: Date,
  random: CodeSuffixSource,
): string {
  const day = todayVN(now).replace(/-/g, '');
  const code = `CLX-${day}-${random(APPOINTMENT_CODE_SUFFIX_LENGTH)}`;
  if (!APPOINTMENT_CODE_PATTERN.test(code))
    throw new RangeError('bộ sinh mã lịch hẹn trả phần đuôi không hợp lệ');
  return code;
}

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
