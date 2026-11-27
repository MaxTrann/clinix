import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  CHAT_CONTENT_MAX,
  CHAT_COUNTER_FROM,
  contentLength,
} from './chat-format';

// Ô soạn tin (chat F3; PLAN chat 5.13; WCH-09, WCH-10). Enter gửi, Shift+Enter xuống dòng; đang gõ bằng bộ gõ (IME, `isComposing`) thì Enter là chọn chữ,
// không gửi. Bấm gửi là chữ chuyển ngay sang bong bóng "Đang gửi…" (ô trống), nên bấm đúp lần hai gặp ô rỗng và không gửi gì; tin lỗi giữ nguyên nội dung ở
// bong bóng có nút "Gửi lại" (A1). Nháp nằm ở `drafts` của khung (bộ nhớ, theo hội thoại), không ghi kho trình duyệt (WCH-17).

interface MessageComposerProps {
  disabled: boolean;
  /** Lý do khoá ô soạn (hiện dưới ô, nối với ô bằng `aria-describedby`). */
  disabledReason: string | null;
  initialDraft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
}

export function MessageComposer({
  disabled,
  disabledReason,
  initialDraft,
  onDraftChange,
  onSend,
}: MessageComposerProps) {
  const [text, setText] = useState(initialDraft);
  // Giá trị mới nhất đọc được ngay trong cùng một lượt sự kiện (hai lần Enter trước khi React vẽ lại)
  const latest = useRef(initialDraft);
  const length = contentLength(text);
  const tooLong = length > CHAT_CONTENT_MAX;
  const empty = length === 0;

  const update = (next: string) => {
    latest.current = next;
    setText(next);
    onDraftChange(next);
  };

  const submit = () => {
    const value = latest.current;
    const size = contentLength(value);
    if (disabled || size === 0 || size > CHAT_CONTENT_MAX) return;
    update('');
    onSend(value);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    submit();
  };

  return (
    <form onSubmit={onSubmit} className="border-t border-gray-200 p-3">
      <label htmlFor="chat-composer" className="sr-only">
        Nội dung tin nhắn
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="chat-composer"
          rows={2}
          value={text}
          disabled={disabled}
          aria-describedby={
            disabledReason
              ? 'chat-composer-reason'
              : length >= CHAT_COUNTER_FROM
                ? 'chat-composer-counter'
                : undefined
          }
          aria-invalid={tooLong || undefined}
          placeholder={disabled ? undefined : 'Nhập tin nhắn…'}
          onChange={(event) => update(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={disabled || empty || tooLong}
          className="min-h-11 shrink-0 rounded-xl bg-brand-strong px-4 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
        >
          Gửi
        </button>
      </div>
      {disabledReason ? (
        <p id="chat-composer-reason" className="mt-2 text-sm text-gray-600">
          {disabledReason}
        </p>
      ) : (
        length >= CHAT_COUNTER_FROM && (
          <p
            id="chat-composer-counter"
            className={`mt-1 text-right text-xs ${tooLong ? 'text-danger-strong' : 'text-gray-500'}`}
          >
            {length}/{CHAT_CONTENT_MAX}
            {tooLong && ' · Tin nhắn tối đa 2000 ký tự.'}
          </p>
        )
      )}
    </form>
  );
}
