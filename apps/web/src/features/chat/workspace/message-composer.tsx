import { FileText, Paperclip, X } from 'lucide-react';
import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  CHAT_FILE_ACCEPT,
  attachmentError,
  formatFileSize,
  isImageType,
} from '../attachments/attachment-rules';
import { ObjectUrlImage } from '../attachments/object-url-image';
import {
  CHAT_CONTENT_MAX,
  CHAT_COUNTER_FROM,
  contentLength,
} from './chat-format';

// Ô soạn tin (chat F3; PLAN chat 5.13; WCH-09, WCH-10). Enter gửi, Shift+Enter xuống dòng; đang gõ bằng bộ gõ (IME, `isComposing`) thì Enter là chọn chữ,
// không gửi. Bấm gửi là chữ chuyển ngay sang bong bóng "Đang gửi…" (ô trống), nên bấm đúp lần hai gặp ô rỗng và không gửi gì; tin lỗi giữ nguyên nội dung ở
// bong bóng có nút "Gửi lại" (A1). Nháp nằm ở `drafts` của khung (bộ nhớ, theo hội thoại), không ghi kho trình duyệt (WCH-17).
// chat F6 (WCH-14): nút "Đính kèm" chọn MỘT tệp; chặn sớm loại và cỡ (máy chủ vẫn kiểm theo nội dung); xem trước ảnh bằng object URL, PDF hiện tên và cỡ;
// có tệp thì được gửi không kèm chữ. Bấm gửi là tệp cũng chuyển sang bong bóng (ô trống) như chữ. Tệp chỉ nằm trong bộ nhớ, không kho trình duyệt.

interface MessageComposerProps {
  disabled: boolean;
  /** Lý do khoá ô soạn (hiện dưới ô, nối với ô bằng `aria-describedby`). */
  disabledReason: string | null;
  initialDraft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string, tep: File | null) => void;
}

export function MessageComposer({
  disabled,
  disabledReason,
  initialDraft,
  onDraftChange,
  onSend,
}: MessageComposerProps) {
  const [text, setText] = useState(initialDraft);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // Giá trị mới nhất đọc được ngay trong cùng một lượt sự kiện (hai lần Enter trước khi React vẽ lại)
  const latest = useRef(initialDraft);
  const latestFile = useRef<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const length = contentLength(text);
  const tooLong = length > CHAT_CONTENT_MAX;
  const empty = length === 0 && file === null;

  const update = (next: string) => {
    latest.current = next;
    setText(next);
    onDraftChange(next);
  };

  const attach = (next: File | null) => {
    latestFile.current = next;
    setFile(next);
  };

  const submit = () => {
    const value = latest.current;
    const tep = latestFile.current;
    const size = contentLength(value);
    if (disabled || (size === 0 && tep === null) || size > CHAT_CONTENT_MAX)
      return;
    update('');
    attach(null);
    setFileError(null);
    onSend(value, tep);
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

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    // Cho chọn lại đúng tệp đó sau khi bỏ (ô chọn không bắn `change` nếu giá trị không đổi)
    event.target.value = '';
    if (!chosen) return;
    const error = attachmentError(chosen);
    setFileError(error);
    attach(error ? null : chosen);
  };

  const describedBy =
    [
      disabledReason ? 'chat-composer-reason' : null,
      !disabledReason && length >= CHAT_COUNTER_FROM
        ? 'chat-composer-counter'
        : null,
      fileError ? 'chat-composer-file-error' : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <form onSubmit={onSubmit} className="border-t border-gray-200 p-3">
      {file && (
        <div className="mb-2 flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 p-2">
          {isImageType(file.type) ? (
            <ObjectUrlImage
              blob={file}
              alt={`Ảnh sắp gửi: ${file.name}`}
              className="size-14 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <FileText
              className="size-6 shrink-0 text-gray-500"
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 flex-1 break-all text-sm">
            {file.name}
            <span className="text-xs text-gray-500">
              {' '}
              · {formatFileSize(file.size)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => attach(null)}
            aria-label={`Bỏ tệp ${file.name}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-gray-300"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <label htmlFor="chat-composer" className="sr-only">
        Nội dung tin nhắn
      </label>
      <div className="flex items-end gap-2">
        <input
          ref={picker}
          type="file"
          accept={CHAT_FILE_ACCEPT}
          aria-label="Chọn tệp đính kèm"
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          onChange={onPick}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => picker.current?.click()}
          aria-label="Đính kèm ảnh hoặc PDF"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-gray-300 disabled:opacity-50"
        >
          <Paperclip className="size-5" aria-hidden="true" />
        </button>
        <textarea
          id="chat-composer"
          rows={2}
          value={text}
          disabled={disabled}
          aria-describedby={describedBy}
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
      {fileError && (
        <p
          id="chat-composer-file-error"
          role="alert"
          className="mt-1 text-sm text-danger-strong"
        >
          {fileError}
        </p>
      )}
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
