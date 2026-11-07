import { ChevronDown, CircleAlert, Lock } from 'lucide-react';
import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref, RefObject } from 'react';
import { GENDER_OPTIONS, type GenderOption } from './profile-format';

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
          required={required}
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

export interface GenderFieldProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  selectRef?: Ref<HTMLSelectElement>;
}

// Ô Giới tính (mã Nam, Nu, Khac; Q3), dùng chung cho form Bản thân (tuỳ chọn) và form người thân (bắt buộc)
export function GenderField({
  value,
  onChange,
  required,
  error,
  selectRef,
}: GenderFieldProps) {
  return (
    <SelectField
      label="Giới tính"
      required={required}
      emptyLabel="Chọn giới tính"
      options={GENDER_OPTIONS}
      value={value}
      error={error}
      selectRef={selectRef}
      onChange={onChange}
    />
  );
}

export interface BirthDateFieldProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}

// Ô Ngày sinh: ô văn bản dd/mm/yyyy (Q7), nhãn phụ "(dd/mm/yyyy)" luôn hiện (TRACKING F3-E), không `type=date`
export function BirthDateField({
  value,
  onChange,
  required,
  error,
  inputRef,
}: BirthDateFieldProps) {
  return (
    <TextField
      label="Ngày sinh"
      labelHint="(dd/mm/yyyy)"
      required={required}
      maxLength={10}
      autoComplete="off"
      value={value}
      error={error}
      inputRef={inputRef}
      onChange={(event) => onChange(event.target.value)}
    />
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

export interface FormActionsProps {
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  onCancel: () => void;
  // Nút phụ ở ĐẦU hàng, dồn về mép trái, xa nút gửi (patient F7: nút "Ngừng sử dụng" của form người thân). Không truyền thì
  // KHÔNG thêm phần tử nào vào DOM: hàng nút của ProfileForm (F3) giữ nguyên từng ký tự (TRACKING F7-C).
  leadingAction?: ReactNode;
}

// Hàng nút cuối form (Hủy, gửi), dùng chung cho form sửa Bản thân (F3) và form người thân (F6, TRACKING F6-B).
// Không huỷ được yêu cầu đang bay (huỷ giữa chừng thì không biết hiện dữ liệu nào), nên khoá cả hai nút khi đang lưu.
export function FormActions({
  pending,
  submitLabel,
  pendingLabel,
  onCancel,
  leadingAction,
}: FormActionsProps) {
  return (
    <div className="mt-[1.2rem] flex flex-wrap justify-end gap-2.5">
      {leadingAction ? <div className="mr-auto">{leadingAction}</div> : null}
      <button
        type="button"
        disabled={pending}
        onClick={onCancel}
        className="min-h-[2.6667rem] rounded-lg border border-gray-200 bg-white px-[1.2rem] text-sm leading-normal font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        Hủy
      </button>
      <button
        type="submit"
        disabled={pending}
        className="min-h-[2.6667rem] rounded-lg border border-transparent bg-brand-strong px-[1.2rem] text-sm leading-normal font-semibold text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
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
