// Chính sách số điện thoại (S5): đúng 10 chữ số, bắt đầu bằng 0. Lưu dạng 10 số liền.
// Việc chỉ nhận MỘT dấu cách hoặc MỘT dấu chấm giữa các nhóm số (không nhận `-`, `+84`) là [đề xuất] của AI chưa được
// nhóm duyệt, xem TRACKING.md mục 3 (A1-B).
import { trimAsciiWhitespace } from './ascii-text.js';

// Các nhóm chữ số ASCII, cách nhau bởi đúng một dấu cách hoặc một dấu chấm; không có dấu ở đầu/cuối
const PHONE_WITH_SEPARATORS = /^[0-9]+(?:[ .][0-9]+)*$/;
const VIETNAM_PHONE = /^0[0-9]{9}$/;

// Trả số 10 chữ số đã chuẩn hoá, hoặc null nếu đầu vào không hợp lệ
export function normalizePhone(raw: string): string | null {
  const trimmed = trimAsciiWhitespace(raw);
  if (!PHONE_WITH_SEPARATORS.test(trimmed)) return null;
  const digits = trimmed.replace(/[ .]/g, '');
  return VIETNAM_PHONE.test(digits) ? digits : null;
}
