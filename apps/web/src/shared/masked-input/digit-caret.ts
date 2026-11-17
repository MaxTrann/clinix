// Trợ giúp chung cho các ô nhập có mặt nạ (ô giá, ô giờ 24h): định dạng lại chuỗi nhưng giữ con trỏ đúng chỗ bằng cách đếm số
// CHỮ SỐ đứng trước con trỏ (dấu chấm, dấu hai chấm thêm vào hay bớt đi không làm lệch).

export const onlyDigits = (text: string): string => text.replace(/\D/gu, '');

// Vị trí ngay sau chữ số thứ `count` của `text`; 0 nếu `count` ≤ 0, cuối chuỗi nếu `text` có ít chữ số hơn
export function caretAfterDigits(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (/\d/u.test(text.charAt(index))) {
      seen += 1;
      if (seen === count) return index + 1;
    }
  }
  return text.length;
}
