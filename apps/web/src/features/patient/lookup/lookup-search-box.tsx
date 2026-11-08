import { Search, X } from 'lucide-react';
import { useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { LOOKUP_TEXT } from './lookup-messages';
import type { KeywordHint } from './use-patient-search';

export interface LookupSearchBoxProps {
  value: string;
  // Câu dưới ô (từ khoá một ký tự, quá dài, có ký tự cấm); null ⇒ không có
  hint: KeywordHint | null;
  onChange: (value: string) => void;
  // Enter (trừ lúc bộ gõ đang ghép dấu)
  onSubmit: () => void;
  onClear: () => void;
  // `compositionstart` ⇒ true, `compositionend` ⇒ false
  onComposingChange: (composing: boolean) => void;
}

// Ô tìm của trang tra cứu (patient F8; Figma `483:2` đến `505:2`): kính lúp bên trái, nút "Xóa tìm kiếm" bên phải khi có chữ, ô rộng tối đa 480 px.
// Riêng tư (H5, TRACKING F8-H): từ khoá là dữ liệu cá nhân nên không `name`, không `<form>` (trình duyệt chỉ lưu lịch sử khi gửi form) và
// `autoComplete="off"`. Không dùng `type="search"`: Chrome tự thêm nút xoá thứ hai. Không `maxLength`: nó đếm UTF-16 và cắt im lặng.
// Viền focus theo ADR 0004 (outline brand toàn cục, 3,62:1); Figma `505:2` vẽ viền cyan dày.
export function LookupSearchBox({
  value,
  hint,
  onChange,
  onSubmit,
  onClear,
  onComposingChange,
}: LookupSearchBoxProps) {
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    // Enter đang chốt chữ của bộ gõ không phải lệnh tìm: `isComposing` (Chrome đã đo) hoặc keyCode 229 (IME của Windows, và Safari
    // báo 229 sau `compositionend`)
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    onSubmit();
  }

  function handleClear() {
    onClear();
    inputRef.current?.focus();
  }

  return (
    <div role="search">
      <div className="relative max-w-[32rem]">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-[0.875rem] size-[1rem] -translate-y-1/2 text-gray-500"
        />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={LOOKUP_TEXT.searchLabel}
          aria-describedby={hint ? hintId : undefined}
          placeholder={LOOKUP_TEXT.searchPlaceholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => onComposingChange(true)}
          onCompositionEnd={() => onComposingChange(false)}
          className="block h-[2.6067rem] w-full rounded-xl border border-gray-200 bg-gray-50 pr-[2.25rem] pl-[2.5rem] text-sm text-slate-900 focus-visible:border-brand"
        />
        {value !== '' && (
          // Biểu tượng 15 px của Figma nằm trong vùng bấm 24 × 24 (WCAG 2.2 mục 2.5.8)
          <button
            type="button"
            aria-label={LOOKUP_TEXT.clearSearch}
            onClick={handleClear}
            className="absolute top-1/2 right-[0.45rem] flex size-[1.6rem] -translate-y-1/2 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          >
            <X aria-hidden="true" className="size-[1rem]" />
          </button>
        )}
      </div>
      {hint && (
        <p
          id={hintId}
          className={`mt-1.5 text-xs ${hint.error ? 'text-danger-strong' : 'text-gray-600'}`}
        >
          {hint.text}
        </p>
      )}
    </div>
  );
}
