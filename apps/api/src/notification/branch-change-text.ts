import { toSingleLine } from '../mail/mail-safety.js';

/** Độ dài tối đa của `thong_bao.noi_dung` (cột `varchar(500)`). */
export const THONG_BAO_MAX_LENGTH = 500;

/**
 * Gom danh sách (ví dụ các lịch hẹn bị ảnh hưởng của MỘT bệnh nhân) vào một câu ≤ `max` ký tự (CN-52, CN b9).
 * Hiện được bao nhiêu mục thì hiện, phần còn lại ghi "và N lịch khác". Mọi chữ qua `toSingleLine` (một dòng, không ký tự điều khiển).
 * Ví dụ: `joinWithinLimit('Lịch hẹn bị ảnh hưởng:', ['LH01', 'LH02'])` ⇒ `Lịch hẹn bị ảnh hưởng: LH01, LH02.`
 */
export function joinWithinLimit(
  head: string,
  items: readonly string[],
  max: number = THONG_BAO_MAX_LENGTH,
): string {
  const cleanHead = toSingleLine(head, max);
  const cleanItems = items.map((item) => toSingleLine(item, max));
  // Thử từ nhiều mục nhất xuống ít nhất, lấy câu dài nhất còn vừa giới hạn
  for (let shown = cleanItems.length; shown >= 1; shown--) {
    const hidden = cleanItems.length - shown;
    const tail = hidden > 0 ? ` và ${String(hidden)} lịch khác` : '';
    const text = `${cleanHead} ${cleanItems.slice(0, shown).join(', ')}${tail}.`;
    if (text.length <= max) return text;
  }
  // Không có mục nào, hoặc một mục cũng không vừa: chỉ còn câu mở đầu (cắt nếu cần) kèm tổng số
  const total =
    cleanItems.length > 0 ? ` (${String(cleanItems.length)} lịch)` : '';
  return toSingleLine(`${cleanHead}${total}`, max);
}
