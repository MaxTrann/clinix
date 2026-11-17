import { onlyDigits } from './digit-caret';

// Ô giá của dịch vụ khám chỉ nhận SỐ NGUYÊN ĐỒNG (Trung đồng ý A1, A2): giá giữ trong state dạng chuỗi chữ số, hiển thị ngăn nghìn
// bằng dấu chấm. Tối đa 10 chữ số vì API nhận `^\d{1,10}`. Tất cả ở đây là hàm thuần để test không cần trình duyệt.
// Đã đưa lên `shared/` để bộ lọc giá của `search` dùng chung (search UI PR-A, G4): API search nhận tới 12 chữ số nên nơi đó truyền
// `maxDigits` = 12; không truyền thì giữ 10 và hành vi của admin không đổi.

export const MAX_PRICE_DIGITS = 10;

// `caretDigits` là số chữ số đứng trước con trỏ (không phụ thuộc dấu chấm), xem `caretAfterDigits`
export interface PriceEdit {
  digits: string;
  caretDigits: number;
}

export function formatThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
}

// Bỏ số 0 đứng đầu nhưng giữ lại một số 0 nếu toàn số 0 ("007" ⇒ "7", "000" ⇒ "0"); trả thêm số ký tự đã bỏ để dịch con trỏ
function stripLeadingZeros(digits: string): {
  digits: string;
  removed: number;
} {
  const stripped = digits.replace(/^0+(?=\d)/u, '');
  return { digits: stripped, removed: digits.length - stripped.length };
}

// Chữ số của văn bản dán/thả. Đuôi "[.,]" kèm 1–2 chữ số ở CUỐI là phần lẻ (ngăn nghìn luôn đi với đúng 3 chữ số) nên bỏ,
// để "300.000,50" thành 300000 chứ không bao giờ thành 30000050 (nhầm gấp 100 lần).
export function pasteDigits(text: string): string {
  const withoutSuffix = text.trim().replace(/\D+$/u, '');
  return onlyDigits(withoutSuffix.replace(/[.,]\d{1,2}$/u, ''));
}

// Người dùng gõ/xóa trong ô. `previousText` là chuỗi ĐANG HIỂN THỊ (đã có dấu chấm), `nextText` là chuỗi trình duyệt vừa tạo ra.
export function applyTextChange(
  previousText: string,
  nextText: string,
  caret: number,
  direction: 'backward' | 'forward',
  maxDigits = MAX_PRICE_DIGITS,
): PriceEdit {
  const previousDigits = onlyDigits(previousText);
  let digits = onlyDigits(nextText);
  let caretDigits = onlyDigits(nextText.slice(0, caret)).length;

  // Chỉ mất một dấu chấm (cùng chuỗi chữ số, giá trị ngắn đi): định dạng lại sẽ dựng dấu chấm trở lại và ô đứng yên, nên xóa thêm
  // chữ số kề con trỏ (Backspace: bên trái, Delete: bên phải). Cố ý xử lý ở đây, không chỉ ở keydown: bàn phím ảo/IME gửi keydown
  // "Unidentified" cho Backspace.
  if (nextText.length < previousText.length && digits === previousDigits) {
    if (direction === 'backward') {
      if (caretDigits > 0) {
        digits = digits.slice(0, caretDigits - 1) + digits.slice(caretDigits);
        caretDigits -= 1;
      }
    } else {
      digits = digits.slice(0, caretDigits) + digits.slice(caretDigits + 1);
    }
  }

  // Quá `maxDigits` chữ số: bỏ chữ số vừa gõ, giữ giá trị cũ
  if (digits.length > maxDigits) {
    const extra = digits.length - previousDigits.length;
    return {
      digits: previousDigits,
      caretDigits: Math.min(
        Math.max(0, caretDigits - extra),
        previousDigits.length,
      ),
    };
  }

  const stripped = stripLeadingZeros(digits);
  return {
    digits: stripped.digits,
    caretDigits: Math.max(0, caretDigits - stripped.removed),
  };
}

// Dán hoặc thả chữ vào vùng chọn [start, end) của chuỗi đang hiển thị. `null` khi kết quả quá `maxDigits` chữ số (bỏ cả lần dán).
export function insertText(
  currentText: string,
  start: number,
  end: number,
  pasted: string,
  maxDigits = MAX_PRICE_DIGITS,
): PriceEdit | null {
  const before = onlyDigits(currentText.slice(0, start));
  const after = onlyDigits(currentText.slice(end));
  const inserted = pasteDigits(pasted);
  const stripped = stripLeadingZeros(before + inserted + after);
  if (stripped.digits.length > maxDigits) return null;
  return {
    digits: stripped.digits,
    caretDigits: Math.max(
      0,
      before.length + inserted.length - stripped.removed,
    ),
  };
}

// Giá API trả ("150000.00", "350000.50") nạp vào form sửa: giữ phần nguyên; `hasFraction` cho biết phần lẻ có khác 0 để form báo
// rõ rằng lưu sẽ bỏ phần lẻ (không làm tròn âm thầm).
export function parseApiPrice(value: string): {
  digits: string;
  fraction: string;
  hasFraction: boolean;
} {
  const [integerPart = '', fraction = ''] = value.split('.');
  return {
    digits: stripLeadingZeros(onlyDigits(integerPart)).digits,
    fraction,
    hasFraction: /[1-9]/u.test(fraction),
  };
}
