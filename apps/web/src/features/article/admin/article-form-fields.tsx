import { useId } from 'react';
import type { ArticleStatus } from '../api/article-types';
import {
  CONTROL_CLASS,
  FIELD_ERROR_CLASS,
  LABEL_CLASS,
  TEXTAREA_CLASS,
} from './article-styles';
import { FORM_TEXT, STATUS_LABEL } from './article-text';

// Ô chữ một dòng hay nhiều dòng (có `rows` ⇒ nhiều dòng) kèm nhãn, gợi ý, bộ đếm và lỗi. Ô lỗi có `aria-invalid="true"` để `useFocusFirstInvalid` đưa focus vào
// (PLAN article A1). Chữ đã nhập giữ nguyên khi có lỗi: ô chỉ hiển thị `value` của bản nháp.
interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  rows?: number;
  hint?: string;
  // Chữ bộ đếm ("x / 20.000"); `counterOver` ⇒ tô đỏ khi vượt giới hạn
  counter?: string;
  counterOver?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  rows,
  hint,
  counter,
  counterOver = false,
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint === undefined ? null : hintId, error === undefined ? null : errorId]
      .filter(Boolean)
      .join(' ') || undefined;
  const shared = {
    id,
    value,
    disabled,
    'aria-required': required ? true : undefined,
    'aria-invalid': error === undefined ? undefined : true,
    'aria-describedby': describedBy,
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={LABEL_CLASS}>
          {label}
        </label>
        {counter !== undefined && (
          <span
            className={`text-sm ${counterOver ? 'font-medium text-danger-strong' : 'text-gray-500'}`}
          >
            {counter}
          </span>
        )}
      </div>
      {hint !== undefined && (
        <p id={hintId} className="text-sm text-gray-600">
          {hint}
        </p>
      )}
      {rows === undefined ? (
        <input
          {...shared}
          type="text"
          className={CONTROL_CLASS}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      ) : (
        <textarea
          {...shared}
          rows={rows}
          className={TEXTAREA_CLASS}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
      {error !== undefined && (
        <p id={errorId} className={FIELD_ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  );
}

interface StatusFieldProps {
  value: ArticleStatus;
  onChange: (value: ArticleStatus) => void;
  // Tạo mới: chỉ Bản nháp và Đã xuất bản; sửa bài có thêm Lưu trữ (PLAN 5.11, MH1)
  allowArchived: boolean;
  error?: string;
  disabled?: boolean;
}

export function StatusField({
  value,
  onChange,
  allowArchived,
  error,
  disabled = false,
}: StatusFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const options: ArticleStatus[] = allowArchived
    ? ['BanNhap', 'DaXuatBan', 'LuuTruAn']
    : ['BanNhap', 'DaXuatBan'];

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {FORM_TEXT.statusLabel}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        className={`${CONTROL_CLASS} sm:max-w-xs`}
        onChange={(event) =>
          onChange(event.currentTarget.value as ArticleStatus)
        }
      >
        {options.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABEL[status]}
          </option>
        ))}
      </select>
      {error !== undefined && (
        <p id={errorId} className={FIELD_ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  );
}
