import { X } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ARTICLE_ERROR, articleErrorText } from '../common/article-errors';
import { addHashtag, HASHTAG_MAX_COUNT } from '../common/hashtag-name';
import {
  CONTROL_CLASS,
  FIELD_ERROR_CLASS,
  LABEL_CLASS,
} from './article-styles';
import { FORM_TEXT, removeTagLabel, tagCounter } from './article-text';
import { useHashtagSuggestions } from './use-hashtag-suggestions';

interface HashtagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  // Lỗi từ máy chủ hay từ kiểm tại chỗ của biểu mẫu, gắn dưới ô Thẻ
  error?: string;
  disabled?: boolean;
}

const OPTION_CLASS =
  'flex min-h-[44px] cursor-pointer items-center px-3 text-sm text-gray-800';

// Ô thẻ (PLAN article 5.6, 5.11, 2.4.55 b2): Enter hay dấu phẩy thêm chip, gợi ý thẻ đã có khi gõ (chọn bằng chuột hay ↑ ↓ + Enter), bỏ chip, tối đa 10 thẻ.
// Chữ gõ được chuẩn hoá như máy chủ (`hashtag-name.ts`) nên chip hiện đúng thứ sẽ lưu; thẻ trùng bị bỏ im lặng. Chữ còn dở khi rời ô được thêm luôn (khỏi mất khi bấm Lưu).
export function HashtagInput({
  value,
  onChange,
  error,
  disabled = false,
}: HashtagInputProps) {
  const id = useId();
  const listId = `${id}-list`;
  const errorId = `${id}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { names } = useHashtagSuggestions(text, value);
  const open = focused && !dismissed && names.length > 0;
  const active = open && activeIndex < names.length ? activeIndex : -1;
  const shownError = localError ?? error ?? null;
  const optionId = (index: number) => `${id}-option-${index}`;

  // Thêm lần lượt các mảnh chữ vào danh sách; dừng ở mảnh đầu tiên bị từ chối (sai ký tự hay đã đủ 10 thẻ). `rest` là chữ còn lại để ở ô.
  function addParts(parts: string[], rest: string) {
    let tags = value;
    let stoppedAt: number | null = null;
    let reason: 'INVALID' | 'TOO_MANY' | null = null;
    for (
      let index = 0;
      index < parts.length && stoppedAt === null;
      index += 1
    ) {
      const result = addHashtag(tags, parts[index]);
      if (result.ok) tags = result.tags;
      else if (result.reason !== 'EMPTY') {
        stoppedAt = index;
        reason = result.reason;
      }
    }
    if (tags !== value) onChange(tags);
    setActiveIndex(-1);
    setDismissed(false);
    if (stoppedAt === null || reason === null) {
      setText(rest);
      setLocalError(null);
      return;
    }
    // Giữ chữ bị từ chối (và phần chưa xử lý) trong ô để người dùng sửa
    setText(
      [...parts.slice(stoppedAt).map((part) => part.trim()), rest]
        .filter(Boolean)
        .join(','),
    );
    setLocalError(
      articleErrorText(
        reason === 'INVALID'
          ? ARTICLE_ERROR.tagInvalid
          : ARTICLE_ERROR.tooManyTags,
      ) ?? null,
    );
  }

  function handleChange(next: string) {
    setLocalError(null);
    setDismissed(false);
    setActiveIndex(-1);
    if (!next.includes(',')) {
      setText(next);
      return;
    }
    const parts = next.split(',');
    const rest = parts.pop() ?? '';
    addParts(parts, rest);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      // Enter ở ô thẻ không được gửi biểu mẫu
      event.preventDefault();
      if (active >= 0) addParts([names[active]], '');
      else if (text.trim() !== '') addParts([text], '');
    } else if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      setActiveIndex((active + 1) % names.length);
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      setActiveIndex(active <= 0 ? names.length - 1 : active - 1);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setDismissed(true);
      setActiveIndex(-1);
    }
  }

  function remove(tag: string) {
    onChange(value.filter((item) => item !== tag));
    setLocalError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={LABEL_CLASS}>
          {FORM_TEXT.tagsLabel}
        </label>
        <span className="text-sm text-gray-500">
          {tagCounter(value.length, HASHTAG_MAX_COUNT)}
        </span>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pr-0.5 pl-3 text-sm text-brand-strong"
            >
              <span className="break-all">#{tag}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={removeTagLabel(tag)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
                onClick={() => remove(tag)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        value={text}
        disabled={disabled}
        placeholder={FORM_TEXT.tagPlaceholder}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        aria-invalid={shownError === null ? undefined : true}
        aria-describedby={shownError === null ? undefined : errorId}
        className={CONTROL_CLASS}
        onChange={(event) => handleChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (text.trim() !== '') addParts([text], '');
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={FORM_TEXT.tagSuggestionsLabel}
          className="max-h-56 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-sm"
        >
          {names.map((name, index) => (
            <li
              key={name}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={`${OPTION_CLASS} ${index === active ? 'bg-brand-soft' : ''}`}
              // `mousedown` (không phải `click`) và chặn mặc định: ô nhập giữ tiêu điểm nên không bị `onBlur` thêm chữ đang gõ
              onMouseDown={(event) => {
                event.preventDefault();
                addParts([name], '');
              }}
            >
              #{name}
            </li>
          ))}
        </ul>
      )}
      {shownError !== null && (
        <p id={errorId} className={FIELD_ERROR_CLASS}>
          {shownError}
        </p>
      )}
    </div>
  );
}
