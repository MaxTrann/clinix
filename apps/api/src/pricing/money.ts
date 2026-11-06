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

function fromCents(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${fraction}`;
}

/** Cộng hai số tiền dạng chuỗi; luôn trả về đúng 2 chữ số thập phân ("300000.00"). */
export function addMoney(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}
