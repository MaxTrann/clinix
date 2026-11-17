import {
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { caretAfterDigits } from './digit-caret';
import {
  applyTextChange,
  formatThousands,
  insertText,
  MAX_PRICE_DIGITS,
  type PriceEdit,
} from './price-format';

interface PriceInputProps {
  id: string;
  // Giá dạng chuỗi chữ số thuần ("150000"); ô hiển thị "150.000" kèm hậu tố "đ" nằm ngoài giá trị
  digits: string;
  onDigitsChange: (digits: string) => void;
  // Dán hoặc thả quá `maxDigits` chữ số: lần đó bị bỏ, nơi dùng báo lỗi (không truyền thì bỏ lặng lẽ)
  onTooLong?: () => void;
  className: string;
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
  // Số chữ số tối đa; mặc định 10 (admin), bộ lọc giá của search truyền 12 cho khớp API
  maxDigits?: number;
  // Hậu tố "đ" trang trí (đặt cho ô cao 39,1 px của admin); bộ lọc giá của search đã ghi "(đ)" ở nhãn nên tắt
  showSuffix?: boolean;
  // Chữ gợi ý; mặc định "0" (admin), truyền chuỗi rỗng khi không muốn có
  placeholder?: string;
}

// Ô giá chỉ nhận số nguyên đồng (admin PR2 mục 6.3). Tự ngăn nghìn khi gõ, dán và thả chữ; giữ con trỏ đúng; xóa qua dấu chấm không
// "đứng yên". Mọi tính toán nằm ở `price-format.ts` (hàm thuần); ở đây chỉ nối vào sự kiện.
export function PriceInput({
  id,
  digits,
  onDigitsChange,
  onTooLong,
  className,
  invalid,
  describedBy,
  disabled,
  maxDigits = MAX_PRICE_DIGITS,
  showSuffix = true,
  placeholder = '0',
}: PriceInputProps) {
  // Phím cuối do keydown ghi lại, chỉ để biết Backspace hay Delete khi sự kiện input không có `inputType` (đường phụ)
  const lastKey = useRef('');
  const shown = formatThousands(digits);

  // Đặt chuỗi và con trỏ ngay trong sự kiện: lúc React vẽ lại, node.value đã khớp giá trị mới nên React không đặt lại và con trỏ ở yên
  function show(input: HTMLInputElement, edit: PriceEdit) {
    const text = formatThousands(edit.digits);
    input.value = text;
    const caret = caretAfterDigits(text, edit.caretDigits);
    input.setSelectionRange(caret, caret);
    onDigitsChange(edit.digits);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    // Bàn phím ảo/IME gửi keydown "Unidentified" cho Backspace nên hướng xóa ưu tiên lấy từ `inputType`
    const inputType = (event.nativeEvent as InputEvent).inputType;
    const forward = inputType
      ? inputType === 'deleteContentForward'
      : lastKey.current === 'Delete';
    show(
      input,
      applyTextChange(
        shown,
        input.value,
        input.selectionStart ?? input.value.length,
        forward ? 'forward' : 'backward',
        maxDigits,
      ),
    );
  }

  function insert(input: HTMLInputElement, text: string) {
    const start = input.selectionStart ?? shown.length;
    const edit = insertText(
      shown,
      start,
      input.selectionEnd ?? start,
      text,
      maxDigits,
    );
    if (edit === null) onTooLong?.();
    else show(input, edit);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    insert(event.currentTarget, event.clipboardData.getData('text'));
  }

  // Thả chữ vào ô đi cùng đường với dán, tại vùng chọn hiện tại
  function handleDrop(event: DragEvent<HTMLInputElement>) {
    event.preventDefault();
    insert(event.currentTarget, event.dataTransfer.getData('text'));
  }

  return (
    <span className="relative block">
      <input
        id={id}
        className={className}
        value={shown}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={handleChange}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          lastKey.current = event.key;
        }}
        onPaste={handlePaste}
        onDrop={handleDrop}
      />
      {/* Hậu tố chỉ để nhìn; nhãn "Giá mặc định (VND)" đã nêu đơn vị cho trình đọc màn hình */}
      {showSuffix && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-[11.25px] flex h-[39.1px] items-center text-[13.125px] text-text-secondary"
        >
          đ
        </span>
      )}
    </span>
  );
}
