// Định dạng tiền VND dùng chung (payment F1, PLAN 6.7: MỘT `formatVnd` ở `shared/`). Các bản chép cũ ở booking, search, admin chưa gộp về đây (TECH_DEBT 109).
// Tiền từ API là CHUỖI decimal (`"350000.00"`, `"-100000.00"`, cột DECIMAL của MySQL). Mọi xử lý đều trên CHUỖI, không qua `Number`: số lớn hơn 2^53
// hay giá trị như "0.10" không bị sai vì làm tròn nhị phân (H4, WVI-04).

// Có thể có dấu trừ ở đầu (lịch sử ví trả tiền ra là số âm), phần thập phân tuỳ chọn. Không nhận số mũ, khoảng trắng, dấu cộng.
const DECIMAL_AMOUNT = /^(-?)(\d+)(?:\.(\d+))?$/;

// Dấu trừ hiển thị là U+2212 như Figma `417:2` ("−100.000đ"), không phải gạch nối
const MINUS_SIGN = '−';

interface ParsedAmount {
  negative: boolean;
  // "350.000" hoặc "50.000,5": phần nguyên có dấu chấm ngăn nghìn, phần lẻ (nếu khác 0) sau dấu phẩy
  digits: string;
  isZero: boolean;
}

function parseAmount(amount: string): ParsedAmount {
  const match = DECIMAL_AMOUNT.exec(amount);
  if (match === null) throw new RangeError(`Số tiền không hợp lệ: ${amount}`);
  const [, sign, integerRaw, fractionRaw = ''] = match;
  const integer = integerRaw.replace(/^0+(?=\d)/, '');
  // Bỏ số 0 thừa ở cuối: "100000.00" ⇒ không có phần lẻ. Hoàn tiền làm tròn tới 0,01 nên phần lẻ khác 0 vẫn phải hiện, không được nuốt mất.
  const fraction = fractionRaw.replace(/0+$/, '');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const isZero = integer === '0' && fraction === '';
  return {
    // "-0.00" coi là 0, không hiện dấu
    negative: sign === '-' && !isZero,
    digits: fraction === '' ? grouped : `${grouped},${fraction}`,
    isZero,
  };
}

/** "350000.00" ⇒ "350.000" (không kèm "đ", không kèm dấu): cho chỗ Figma tách riêng chữ "đ" (thẻ số dư). */
export function formatVndDigits(amount: string): string {
  return parseAmount(amount).digits;
}

/** "350000.00" ⇒ "350.000đ"; "-100000.00" ⇒ "−100.000đ". Chuỗi sai dạng ném RangeError. */
export function formatVnd(amount: string): string {
  const { negative, digits } = parseAmount(amount);
  return `${negative ? MINUS_SIGN : ''}${digits}đ`;
}

/** Như `formatVnd` nhưng số dương có "+" (cột Số tiền của lịch sử ví: "+500.000đ"). Số 0 không có dấu. */
export function formatSignedVnd(amount: string): string {
  const { negative, digits, isZero } = parseAmount(amount);
  const sign = negative ? MINUS_SIGN : isZero ? '' : '+';
  return `${sign}${digits}đ`;
}

/** Bỏ dấu trừ: "-100000.00" ⇒ "100000.00" (yêu cầu rút chưa trừ số dư thì hiện số tiền không dấu, Figma `437:2`). */
export function absoluteAmount(amount: string): string {
  parseAmount(amount);
  return amount.startsWith('-') ? amount.slice(1) : amount;
}

/** Số âm (khác 0) hay không, kiểm trên chuỗi. */
export function isNegativeAmount(amount: string): boolean {
  return parseAmount(amount).negative;
}

export function isDecimalAmount(value: string): boolean {
  return DECIMAL_AMOUNT.test(value);
}
