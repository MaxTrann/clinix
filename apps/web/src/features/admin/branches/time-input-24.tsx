import { useRef, type ChangeEvent } from 'react';
import { applyTimeChange, normalizeTime } from './time-format';

interface TimeInput24Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label': string;
}

// Ô giờ 24h gõ tay, thay `<input type="time">` (hiện AM/PM theo cài đặt Windows), admin PR2 mục 6.4. Kiểu dáng lấy từ
// `.timeRange input` của nơi đặt nó (viền focus của PR1). Mặt nạ và chuẩn hóa ở `time-format.ts`; giờ có hợp lệ hay không
// vẫn do `isTime` kiểm lúc Lưu, nên giờ sai ("24:00") được giữ nguyên chứ không bị sửa thầm.
export function TimeInput24({
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: TimeInput24Props) {
  // Phím cuối do keydown ghi lại, chỉ dùng khi sự kiện input không có `inputType` (đường phụ)
  const lastKey = useRef('');

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const inputType = (event.nativeEvent as InputEvent).inputType;
    const forward = inputType
      ? inputType === 'deleteContentForward'
      : lastKey.current === 'Delete';
    const edit = applyTimeChange(
      value,
      input.value,
      input.selectionStart ?? input.value.length,
      forward ? 'forward' : 'backward',
    );
    // Đặt chuỗi và con trỏ ngay trong sự kiện để React không đặt lại node.value lúc vẽ lại
    input.value = edit.text;
    input.setSelectionRange(edit.caret, edit.caret);
    if (edit.text !== value) onChange(edit.text);
  }

  function handleBlur() {
    const normalized = normalizeTime(value);
    if (normalized !== value) onChange(normalized);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="08:00"
      maxLength={5}
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(event) => {
        lastKey.current = event.key;
      }}
    />
  );
}
