// Luật ô tìm theo MÃ LỊCH HẸN ĐẦY ĐỦ của danh sách yêu cầu đổi lịch (reschedule F4; PLAN reschedule 5.7: `q` là mã lịch, không tìm một phần). Viết ĐÚNG như `normalizeAppointmentCode` và
// `APPOINTMENT_CODE_PATTERN` ở `apps/api/src/appointments/appointment-code.ts` để thứ web chặn và thứ máy chủ chặn là MỘT: sai dạng thì web báo cạnh ô và KHÔNG gọi API; máy chủ vẫn là lưới an toàn
// (400 `MA_LICH_HEN_KHONG_HOP_LE`). Hàm thuần.

// `CLX-yyyyMMdd-XXXXX`: tám chữ số (`\d` của JavaScript chỉ là 0-9) và năm ký tự Crockford base32 chữ hoa, bỏ I, L, O, U
export const REQUEST_CODE_PATTERN = /^CLX-\d{8}-[0-9A-HJKMNP-TV-Z]{5}$/;

// Cắt khoảng trắng hai đầu bằng `trim()` (như máy chủ) rồi đổi chữ thường `a-z` ASCII thành chữ hoa. Cố ý KHÔNG `toUpperCase()` cả chuỗi: nó đổi `ſ` (U+017F) thành `S`,
// nên hai chuỗi khác nhau cùng ra một mã hợp lệ.
export function normalizeRequestCode(raw: string): string {
  return raw.trim().replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

// `empty`: không có gì để tìm (nghĩa là BỎ bộ lọc, không phải lỗi). `invalid`: có chữ nhưng không đúng dạng mã.
export type RequestCodeCheck =
  { ok: true; code: string } | { ok: false; error: 'empty' | 'invalid' };

export function checkRequestCode(input: string): RequestCodeCheck {
  const code = normalizeRequestCode(input);
  if (code === '') return { ok: false, error: 'empty' };
  return REQUEST_CODE_PATTERN.test(code)
    ? { ok: true, code }
    : { ok: false, error: 'invalid' };
}
