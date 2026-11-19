// Luật THUẦN của tab Rút tiền (payment F6): đọc ô số tiền và so với số khả dụng. Không React, không mạng, để test từng nhánh.
// Tiền KHÔNG qua `Number` (số lớn mất chính xác): so trên chuỗi chữ số. Hạn mức tối thiểu (Q20, 10.000đ) do MÁY CHỦ kiểm và báo `SO_TIEN_NGOAI_HAN_MUC`
// kèm `chiTiet.toiThieu` (Trung chốt 19/11/2026: web không viết cứng số của API).

/** Chỉ giữ chữ số của ô nhập ("100.000" hay "100000" đều được), bỏ số 0 đứng đầu, tối đa 10 chữ số như DTO của B11. */
export function digitsOf(input: string): string {
  return input
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 10);
}

/** Phần nguyên đồng của chuỗi decimal ("350000.00" ⇒ "350000"). Số khả dụng không bao giờ âm (CHECK `chk_vi_so_du`). */
export function wholeDong(amount: string): string {
  return amount.split('.')[0] ?? '0';
}

/** So hai số nguyên không âm dạng chuỗi chữ số, không số 0 đứng đầu (trừ chính "0"). */
export function compareDigits(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export type WithdrawProblem = 'required' | 'overAvailable' | null;

/** Lỗi kiểm ở web trước khi gửi: trống (hay toàn số 0) hoặc vượt số khả dụng. Đúng bằng số khả dụng là hợp lệ (biên). */
export function withdrawProblem(
  digits: string,
  available: string,
): WithdrawProblem {
  if (digits === '' || /^0+$/.test(digits)) return 'required';
  if (compareDigits(digits, wholeDong(available)) > 0) return 'overAvailable';
  return null;
}
