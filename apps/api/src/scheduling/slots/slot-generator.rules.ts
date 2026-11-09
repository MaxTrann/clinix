import type { ShiftRange } from '../branch-hours/branch-hours.types.js';

/**
 * Giờ bắt đầu (giây từ 00:00) của các khung giờ trong một khoảng: ô nào kết thúc quá `denGiay` thì bỏ.
 * Ví dụ 07:30–11:00, 50 phút ⇒ 07:30, 08:20, 09:10, 10:00 (10 phút cuối bị bỏ).
 */
export function generateSlotStarts(
  khoang: ShiftRange,
  thoiLuongPhut: number,
): number[] {
  // Lỗi lập trình, không phải lỗi người dùng: chặn để không lặp vô hạn.
  if (!Number.isInteger(thoiLuongPhut) || thoiLuongPhut <= 0) {
    throw new Error(`Thời lượng khung giờ không hợp lệ: ${thoiLuongPhut}`);
  }
  if (khoang.tuGiay > khoang.denGiay) {
    throw new Error('Khoảng giờ bị ngược (tuGiay > denGiay)');
  }
  const step = thoiLuongPhut * 60;
  const starts: number[] = [];
  for (let start = khoang.tuGiay; start + step <= khoang.denGiay; start += step)
    starts.push(start);
  return starts;
}
