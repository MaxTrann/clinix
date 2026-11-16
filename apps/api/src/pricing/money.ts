/**
 * Tiền VND dạng chuỗi decimal như cột `decimal(12,2)` của DB (ví dụ "200000.00"). Cộng bằng BigInt tính theo đơn vị 0,01
 * nên không dính sai số số thực (H4, Q15). Dùng chung cho `search` và `booking` — không tự cộng bằng `number` ở nơi khác.
 */
const MONEY_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/** "200000.00" / "200000" / "200000.5" ⇒ số đơn vị 0,01 (BigInt). Chuỗi không phải số tiền không âm ⇒ ném lỗi. */
export function toCents(value: string): bigint {
  const match = MONEY_PATTERN.exec(value);
  if (!match) throw new Error(`Số tiền không hợp lệ: ${JSON.stringify(value)}`);
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return BigInt(whole) * 100n + BigInt(fraction);
}

/** Số đơn vị 0,01 (BigInt không âm) ⇒ chuỗi đúng 2 chữ số thập phân. Xuất cho `booking` (`RefundCalculator`, B10): một công thức đổi tiền, không bản thứ hai. */
export function fromCents(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${fraction}`;
}

/** Cộng hai số tiền dạng chuỗi; luôn trả về đúng 2 chữ số thập phân ("300000.00"). */
export function addMoney(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

/** So sánh hai số tiền theo GIÁ TRỊ (không so chuỗi): trả -1 nếu a < b, 0 nếu bằng, 1 nếu a > b. Chuỗi không hợp lệ ⇒ ném lỗi như `toCents`. */
export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const left = toCents(a);
  const right = toCents(b);
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * Trừ hai số tiền: a − b, luôn trả đúng 2 chữ số thập phân. Kết quả ÂM ⇒ ném lỗi: số dư ví và số tiền còn lại không bao giờ âm, nên nơi gọi phải
 * kiểm `compareMoney(a, b) >= 0` (hoặc dưới khoá ví) trước; ném lỗi ở đây là lưới an toàn cuối, không phải cách báo "không đủ số dư".
 */
export function subtractMoney(a: string, b: string): string {
  const result = toCents(a) - toCents(b);
  if (result < 0n) throw new Error(`Kết quả phép trừ tiền âm: ${a} − ${b}`);
  return fromCents(result);
}
