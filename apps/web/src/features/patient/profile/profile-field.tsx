import { ChevronDown, CircleAlert, Lock } from 'lucide-react';
import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref, RefObject } from 'react';
import type { GenderOption } from './profile-format';

// Ô của form hồ sơ (patient F3; frame `432:2`): nhãn trên ô, dấu `*` cho ô bắt buộc, câu lỗi dưới ô.
// Auth không xuất ô nhập của nó qua index.ts và bố cục này khác (không biểu tượng bên trái), nên module có ô riêng (TRACKING F3-B).

// Chiều cao 41,5px của Figma (gốc 15px); viền 1px gray-200, bo 8px ⇒ rounded-lg
const CONTROL =
  'block h-[2.7667rem] w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900';
const LABEL =
  'mb-[5px] block text-[0.8rem] leading-normal font-medium text-gray-600';

interface LabelProps {
  label: string;
  // Nhãn phụ cố định, ví dụ "(dd/mm/yyyy)": hiện cả khi ô lỗi hay đã có dữ liệu (khác placeholder)
  labelHint?: string;
  required?: boolean;
}

function FieldLabel({
  id,
  label,
  labelHint,
  required,
}: LabelProps & { id: string }) {
  return (
    <label htmlFor={id} className={LABEL}>
      {label}
      {required && (
        <span aria-hidden="true" className="ml-1 text-danger">
          *
        </span>
      )}
      {labelHint && (
        <span className="font-normal text-gray-500"> {labelHint}</span>
      )}
    </label>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-xs text-danger">
      {children}
    </p>
  );
}

export interface TextFieldProps
  extends
    LabelProps,
    Omit<
      InputHTMLAttributes<HTMLInputElement>,
      'id' | 'className' | 'required' | 'aria-invalid' | 'aria-describedby'
    > {
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  labelHint,
  required,
  error,
  inputRef,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <FieldLabel
        id={id}
        label={label}
        labelHint={labelHint}
        required={required}
      />
      <input
        {...inputProps}
        ref={inputRef}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${CONTROL} ${error ? 'border-danger' : ''}`}
      />
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export interface SelectFieldProps extends LabelProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly GenderOption[];
  // Chữ của lựa chọn rỗng ("Chọn giới tính")
  emptyLabel: string;
  error?: string;
  selectRef?: Ref<HTMLSelectElement>;
}

export function SelectField({
  label,
  labelHint,
  required,
  value,
  onChange,
  options,
  emptyLabel,
  error,
  selectRef,
}: SelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <FieldLabel
        id={id}
        label={label}
        labelHint={labelHint}
        required={required}
      />
      <div className="relative">
        <select
          ref={selectRef}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${CONTROL} appearance-none pr-9 ${error ? 'border-danger' : ''}`}
        >
          <option value="">{emptyLabel}</option>
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-gray-500"
          aria-hidden="true"
        />
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

// Ô chỉ đọc (email): KHÔNG phải `input`, nên DOM không có ô sửa nào cho email (TRACKING F3-E, câu x). Nền gray-50 với chữ gray-500
// đạt 4,63:1; nền gray-100 chỉ 4,39:1 nên không dùng.
export function ReadOnlyField({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  const id = useId();
  return (
    <div>
      <p id={`${id}-label`} className={LABEL}>
        {label}
      </p>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-note`}
        className="flex min-h-[2.7667rem] items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500"
      >
        <span className="min-w-0 break-all">{value}</span>
        <Lock className="size-3.5 shrink-0" aria-hidden="true" />
      </div>
      <p
        id={`${id}-note`}
        className="mt-[3px] text-[0.7333rem] leading-normal text-gray-500"
      >
        {note}
      </p>
    </div>
  );
}

// Hộp cảnh báo chung ở đầu form (focus được để người dùng nghe câu lỗi); chữ danger-strong trên danger-soft đạt 5,87:1
export function FormAlert({
  alertRef,
  children,
}: {
  alertRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className="mb-4 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft p-3 text-sm text-danger-strong"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
