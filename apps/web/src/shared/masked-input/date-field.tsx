import { Calendar } from 'lucide-react';
import {
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type Ref,
} from 'react';
import {
  applyDateChange,
  isCompleteInvalidDate,
  isoToDisplay,
  parseDisplayDate,
  parsePastedDate,
} from './date-format';
import { DATE_TEXT } from './date-text';

export interface DateFieldProps {
  id: string;
  // `YYYY-MM-DD` hoặc '' (giống `input type="date"` mà ô này thay thế): state và API của nơi gọi KHÔNG đổi
  value: string;
  onChange: (iso: string) => void;
  // Chỉ giới hạn bộ chọn gốc (như ô gốc); ngày gõ tay ngoài khoảng vẫn đi ra để form tự báo như trước (ví dụ "ngày đã qua")
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  // Kiểu của ô chữ (chiều cao, viền, cỡ chữ của nơi gọi); luôn thêm `w-full` và chỗ cho nút lịch bên phải
  className?: string;
  // Khung ngoài (cho nơi cần ô hẹp, ví dụ `w-[142px] self-start`)
  wrapperClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}

// Dán một phần ngày (chỉ chữ số và dấu phân cách) thì chèn tại vùng chọn rồi qua mặt nạ; có chữ khác lẫn vào thì bỏ cả lần dán
const PARTIAL_PASTE = /^[\d/.\-\s]+$/;

// Ô ngày dd/mm/yyyy (doctor UX1, G5): ô chữ có mặt nạ cộng nút lịch mở bộ chọn gốc của trình duyệt. Ô `input type="date"` gốc hiện định dạng
// theo cài đặt máy (mm/dd/yyyy) mà mã không đổi được. Mọi tính toán nằm ở `date-format.ts` (hàm thuần); ở đây chỉ nối vào sự kiện.
// Gắn nhãn bằng `<label htmlFor={id}>`, KHÔNG bọc `<label>` quanh ô: nhãn bọc ghép với mọi phần tử nhập bên trong (ô chữ, nút lịch, ô gốc ẩn).
export function DateField({
  id,
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  readOnly,
  className,
  wrapperClassName,
  inputRef,
  'aria-invalid': ariaInvalid,
  'aria-describedby': describedBy,
}: DateFieldProps) {
  // Chữ người dùng đang gõ. Chỉ có nghĩa khi còn khớp `value` (chữ dở dang hay ngày sai thì `value` là ''); nơi gọi đổi `value` thì hiện theo `value`
  const [text, setText] = useState(() => isoToDisplay(value));
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  // Phím cuối do keydown ghi lại, chỉ để biết Backspace hay Delete khi sự kiện input không có `inputType` (đường phụ)
  const lastKey = useRef('');
  useImperativeHandle(inputRef, () => textRef.current as HTMLInputElement);

  const toIso = (shown: string) => parseDisplayDate(shown) ?? '';
  const shown = toIso(text) === value ? text : isoToDisplay(value);
  const invalidDate = isCompleteInvalidDate(shown);

  // Đặt chuỗi và con trỏ ngay trong sự kiện: lúc React vẽ lại, node.value đã khớp nên React không đặt lại và con trỏ ở yên
  function commit(input: HTMLInputElement, next: string, caret: number) {
    input.value = next;
    input.setSelectionRange(caret, caret);
    setText(next);
    const iso = toIso(next);
    if (iso !== value) onChange(iso);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (readOnly) return;
    const input = event.currentTarget;
    // Bàn phím ảo/IME gửi keydown "Unidentified" cho Backspace nên hướng xoá ưu tiên lấy từ `inputType`
    const inputType = (event.nativeEvent as InputEvent).inputType;
    const forward = inputType
      ? inputType === 'deleteContentForward'
      : lastKey.current === 'Delete';
    const edit = applyDateChange(
      shown,
      input.value,
      input.selectionStart ?? input.value.length,
      forward ? 'forward' : 'backward',
    );
    commit(input, edit.text, edit.caret);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    if (readOnly) return;
    const input = event.currentTarget;
    const clip = event.clipboardData.getData('text');
    const whole = parsePastedDate(clip);
    if (whole !== null) {
      commit(input, whole, whole.length);
      return;
    }
    if (!PARTIAL_PASTE.test(clip) || !/\d/.test(clip)) return;
    const start = input.selectionStart ?? shown.length;
    const end = input.selectionEnd ?? start;
    const edit = applyDateChange(
      shown,
      shown.slice(0, start) + clip + shown.slice(end),
      start + clip.length,
      'backward',
    );
    commit(input, edit.text, edit.caret);
  }

  // Chọn trong bộ chọn gốc (hoặc "Xoá" trong bộ chọn): cùng đường với dán ISO. Ô gốc là ô ẩn nên trả focus về ô chữ.
  function handlePicker(event: ChangeEvent<HTMLInputElement>) {
    const input = textRef.current;
    if (input === null) return;
    commit(input, isoToDisplay(event.target.value), 10);
    input.focus();
  }

  function openPicker() {
    const picker = pickerRef.current;
    if (picker === null) return;
    try {
      if (typeof picker.showPicker === 'function') {
        picker.showPicker();
        return;
      }
    } catch {
      // `showPicker` ném lỗi (cần thao tác của người dùng, ô không hiển thị): thử đường dự phòng bên dưới
    }
    // Dự phòng: trình duyệt không có `showPicker` thì bấm thẳng ô gốc; vẫn không mở được thì gõ tay vẫn dùng được
    picker.focus();
    picker.click();
  }

  // Ngày không tồn tại thì luôn "true"; còn lại chuyển nguyên giá trị của nơi gọi (kể cả "false" mà một số bộ lọc đang đặt)
  const invalidFlag = invalidDate ? true : ariaInvalid;
  const formatId = `${id}-format`;
  const describedByAll =
    [describedBy, invalidDate ? formatId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={wrapperClassName}>
      <div className="relative">
        <input
          id={id}
          ref={textRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder={DATE_TEXT.placeholder}
          className={`${className ?? ''} w-full pr-10`}
          value={shown}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={invalidFlag}
          aria-describedby={describedByAll}
          onChange={handleChange}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            lastKey.current = event.key;
          }}
          onPaste={handlePaste}
        />
        <button
          type="button"
          aria-label={DATE_TEXT.pickerLabel}
          disabled={disabled || readOnly}
          onClick={openPicker}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-gray-600 hover:text-gray-900 disabled:opacity-60"
        >
          <Calendar aria-hidden="true" className="size-4" />
        </button>
        {/* Ô ngày gốc chỉ để mở bộ chọn của trình duyệt (và mang `min`, `max`); không nhận Tab, không đọc cho trình đọc màn hình */}
        <input
          id={`${id}-picker`}
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          min={min}
          max={max}
          value={value}
          disabled={disabled || readOnly}
          onChange={handlePicker}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />
      </div>
      {invalidDate && (
        <p
          id={formatId}
          role="alert"
          className="mt-1 text-xs text-danger-strong"
        >
          {DATE_TEXT.invalid}
        </p>
      )}
    </div>
  );
}
