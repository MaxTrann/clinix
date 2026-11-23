import type { ReactNode } from 'react';

// Các ô của biểu mẫu "Tạo tài khoản nhân sự" (admin F8 PR2): ô chữ, ô chọn, nhóm lựa chọn (vai trò, phạm vi) và dòng chữ chỉ đọc.
// Mỗi ô có nhãn thật (`label` + `htmlFor`), lỗi gắn bằng `aria-describedby` và `aria-invalid`. Viền focus do lớp base vẽ: không `focus:`, `outline-*`, `ring-*` (FG-05).
// Màu theo token của ADR 0004; ô cao tối thiểu 35 px (`py-2` + dòng chữ 20 px + viền).

const INPUT =
  'w-full min-h-[35px] rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary disabled:bg-surface-muted disabled:text-text-muted aria-[invalid=true]:border-danger';

interface FrameProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (describedBy: string | undefined) => ReactNode;
}

/** Nhãn, ô nhập (do `children` vẽ, nhận `aria-describedby` đã ghép gợi ý và lỗi), gợi ý và lỗi. */
function Frame({ id, label, hint, error, children }: FrameProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      {children(describedBy)}
      {hint !== undefined && (
        <p id={hintId} className="text-[11px] text-text-secondary">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="text-xs text-danger-strong">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  maxLength: number;
  onChange: (value: string) => void;
}

export function TextField({
  id,
  label,
  value,
  error,
  inputMode = 'text',
  maxLength,
  onChange,
}: TextFieldProps) {
  return (
    <Frame id={id} label={label} error={error}>
      {(describedBy) => (
        <input
          id={id}
          className={INPUT}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          maxLength={maxLength}
          value={value}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Frame>
  );
}

export interface ChoiceOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  options: ChoiceOption[];
  error?: string;
  hint?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function SelectField({
  id,
  label,
  value,
  placeholder,
  options,
  error,
  hint,
  disabled = false,
  onChange,
}: SelectFieldProps) {
  return (
    <Frame id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <select
          id={id}
          className={INPUT}
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Frame>
  );
}

export interface RadioOption extends ChoiceOption {
  disabled?: boolean;
  /** Chú thích gắn vào lựa chọn bằng `aria-describedby` (ví dụ vì sao nó bị vô hiệu). */
  note?: string;
}

interface RadioGroupFieldProps {
  id: string;
  label: string;
  value: string;
  options: RadioOption[];
  error?: string;
  onChange: (value: string) => void;
}

/**
 * Nhóm lựa chọn một trong nhiều (vai trò, phạm vi): `role="radiogroup"` có tên, mỗi lựa chọn là ô radio thật nên bàn phím (mũi tên) chạy đúng.
 * Các lựa chọn được phép xuống hàng ở màn hẹp. Nhóm có `tabIndex={-1}` để lỗi "Bắt buộc" đưa được focus vào nhóm.
 */
export function RadioGroupField({
  id,
  label,
  value,
  options,
  error,
  onChange,
}: RadioGroupFieldProps) {
  const labelId = `${id}-label`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span id={labelId} className="text-xs font-medium text-text-secondary">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={errorId}
        aria-invalid={error !== undefined}
        tabIndex={-1}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const noteId =
            option.note === undefined
              ? undefined
              : `${id}-${option.value}-note`;
          return (
            <div key={option.value} className="flex min-w-0 flex-col gap-1">
              <label
                className={`flex min-h-[35px] items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm ${
                  option.disabled
                    ? 'bg-surface-muted text-text-muted'
                    : 'bg-white text-text-primary'
                }`}
              >
                <input
                  type="radio"
                  name={id}
                  value={option.value}
                  checked={value === option.value}
                  disabled={option.disabled}
                  aria-describedby={noteId}
                  onChange={() => onChange(option.value)}
                />
                {option.label}
              </label>
              {option.note !== undefined && (
                <p id={noteId} className="text-[11px] text-text-secondary">
                  {option.note}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {error !== undefined && (
        <p id={errorId} className="text-xs text-danger-strong">
          {error}
        </p>
      )}
    </div>
  );
}

/** Chi nhánh cố định của Admin Chi nhánh: chữ chỉ đọc, không phải ô nhập (NS-05, NS-06). */
export function FixedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <p className="min-h-[35px] rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm break-words text-text-primary">
        {value}
      </p>
    </div>
  );
}
