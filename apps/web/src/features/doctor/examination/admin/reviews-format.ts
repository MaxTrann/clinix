import {
  formatRatingDate,
  formatVisitTime,
} from '../patient/patient-exam-format';
import { REVIEWS_TEXT } from './reviews-text';

// Ngày giờ của màn Kiểm duyệt đánh giá (doctor-exam F7; WKD-15). Cố định +07:00, KHÔNG phụ thuộc múi giờ của máy: dùng lại hàm của `patient/patient-exam-format.ts` (cộng 7 giờ rồi đọc theo UTC). Chuỗi không phải ISO ⇒ "—" (không in "NaN").

// Ngày gửi: "28/05/2026"
export function formatSentDate(iso: string): string {
  return formatRatingDate(iso) ?? REVIEWS_TEXT.none;
}

// Giờ khám ở hộp chi tiết: "09:30 11/06/2026" (Đại duyệt 17/11/2026: lệch Figma `570:2`, nơi ghi `2026-06-11 09:30`, cho nhất quán với "Ngày gửi" cùng hộp)
export function formatVisitStamp(iso: string): string {
  const time = formatVisitTime(iso);
  const date = formatRatingDate(iso);
  return time === null || date === null ? REVIEWS_TEXT.none : `${time} ${date}`;
}
