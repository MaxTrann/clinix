import { Search } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { checkRequestCode } from './request-code';
import { REQUEST_TEXT } from './request-text';

// Ô tìm theo MÃ LỊCH HẸN ĐẦY ĐỦ (reschedule F4; PLAN reschedule 5.7). Khác ô tìm từ khoá của danh sách lịch hẹn: mã gõ dở luôn sai dạng nên KHÔNG tự áp dụng sau một nhịp gõ; áp dụng khi bấm "Tìm" hay Enter.
// Sai dạng ⇒ lỗi cạnh ô, KHÔNG gọi API, tiêu điểm về ô; rỗng ⇒ bỏ bộ lọc. Chữ thường được chuẩn hoá thành chữ hoa (đúng chữ sẽ gửi và ghi lên URL). `rejected`: API vừa từ chối mã (400, lưới an toàn).
// Nơi gọi đặt `key={mã đang áp dụng}`: mã đổi từ ngoài (nút Quay lại, `Xóa lọc`) thì ô dựng lại với giá trị mới.
export function RequestSearch(props: {
  applied: string;
  rejected: boolean;
  onApply: (code: string) => void;
}) {
  const [input, setInput] = useState(props.applied);
  const [invalid, setInvalid] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const showError = invalid || props.rejected;

  function submit() {
    const checked = checkRequestCode(input);
    if (checked.ok) {
      setInvalid(false);
      setInput(checked.code);
      props.onApply(checked.code);
    } else if (checked.error === 'empty') {
      setInvalid(false);
      setInput('');
      props.onApply('');
    } else {
      setInvalid(true);
      fieldRef.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    // Enter đang chốt chữ của bộ gõ không phải lệnh tìm (như `KeywordSearchBox`)
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    submit();
  }

  return (
    <div>
      <div role="search" className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-600"
          />
          <input
            ref={fieldRef}
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label={REQUEST_TEXT.searchLabel}
            aria-invalid={showError}
            aria-describedby={showError ? errorId : undefined}
            placeholder={REQUEST_TEXT.searchPlaceholder}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={handleKeyDown}
            className={`block h-11 w-full rounded-xl border bg-white pr-4 pl-10 text-sm text-gray-900 ${showError ? 'border-danger-strong' : 'border-gray-500'}`}
          />
        </div>
        <button
          type="button"
          onClick={submit}
          className="inline-flex h-11 items-center rounded-xl bg-brand-strong px-5 text-sm font-semibold text-white hover:opacity-90"
        >
          {REQUEST_TEXT.searchButton}
        </button>
      </div>
      {showError && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-xs text-danger-strong"
        >
          {REQUEST_TEXT.codeInvalid}
        </p>
      )}
    </div>
  );
}
