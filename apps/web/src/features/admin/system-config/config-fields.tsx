import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { REMINDER_LIMITS, type ParamDef } from './system-config-params';

// Ba kiểu ô của màn Cài đặt hệ thống: số nguyên, trọng số (số thập phân 2 chữ số), danh sách mốc nhắc lịch.
// Viền focus do lớp base của `styles/index.css` vẽ (test `focus-hygiene`): file này KHÔNG viết `focus:`, `outline-*`, `ring-*`.
// Ô là `type="text"` (không phải `number`): tránh `1e2`, con lăn chuột, dấu phẩy theo locale; chữ nhập được kiểm bằng hàm thuần ở `system-config-values.ts`.

const INPUT =
  'h-[35px] w-28 rounded-[9.375px] border bg-white px-3 text-right text-sm text-slate-900 tabular-nums';

interface FieldFrameProps {
  def: ParamDef;
  id: string;
  hint: string;
  error?: string;
  changed: boolean;
  required: boolean;
  // Chỉ nhắc lịch đặt `labelId` riêng (nhãn của nhóm ô, không phải của một ô)
  labelFor?: string;
  labelId?: string;
  children: ReactNode;
}

function FieldFrame({
  def,
  id,
  hint,
  error,
  changed,
  required,
  labelFor,
  labelId,
  children,
}: FieldFrameProps) {
  const labelContent = (
    <>
      {def.label}
      {required && (
        <span aria-hidden="true" className="text-danger">
          {' '}
          *
        </span>
      )}
    </>
  );
  return (
    <div className="flex flex-col gap-2 border-b border-gray-100 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {labelFor === undefined ? (
            <p id={labelId} className="text-sm font-medium text-gray-900">
              {labelContent}
            </p>
          ) : (
            <label
              htmlFor={labelFor}
              className="text-sm font-medium text-gray-900"
            >
              {labelContent}
            </label>
          )}
          {changed && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-strong">
              Đã sửa
            </span>
          )}
        </div>
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-gray-500">
          {hint}
        </p>
      </div>
      <div className="sm:max-w-[60%] sm:shrink-0">
        {children}
        {error !== undefined && (
          <p
            id={`${id}-error`}
            role="alert"
            className="mt-1 text-xs text-danger"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

const borderOf = (error: string | undefined) =>
  error === undefined ? 'border-gray-300' : 'border-danger';
const describedBy = (id: string, error: string | undefined) =>
  error === undefined ? `${id}-hint` : `${id}-hint ${id}-error`;

interface ScalarFieldProps {
  def: ParamDef;
  id: string;
  value: string;
  error?: string;
  changed: boolean;
  creating: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}

// Số nguyên (chín tham số) hoặc trọng số (hai tham số): chỉ khác `inputMode` và câu gợi ý
export function ScalarField({
  def,
  id,
  value,
  error,
  changed,
  creating,
  disabled,
  onChange,
}: ScalarFieldProps) {
  const rule = def.rule;
  const isWeight = rule.kind === 'weight';
  const hint =
    rule.kind === 'int'
      ? `Từ ${rule.min} đến ${rule.max}${def.unit === '' ? '' : ` ${def.unit}`}.`
      : 'Từ 0 đến 1, tối đa 2 chữ số thập phân; hai trọng số cộng lại bằng 1,00.';
  const required = creating && def.requiredOnCreate;
  return (
    <FieldFrame
      def={def}
      id={id}
      hint={hint}
      error={error}
      changed={changed}
      required={required}
      labelFor={id}
    >
      <input
        id={id}
        name={def.key}
        type="text"
        inputMode={isWeight ? 'decimal' : 'numeric'}
        autoComplete="off"
        className={`${INPUT} ${borderOf(error)}`}
        value={value}
        disabled={disabled}
        placeholder={creating && !def.requiredOnCreate ? 'Mặc định' : undefined}
        aria-required={required || undefined}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(id, error)}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </FieldFrame>
  );
}

interface ReminderFieldProps {
  def: ParamDef;
  id: string;
  values: string[];
  error?: string;
  changed: boolean;
  creating: boolean;
  disabled: boolean;
  onChange: (values: string[]) => void;
}

// Mốc nhắc lịch: 1 đến 5 ô (giờ trước giờ hẹn). Lần đầu được để trống cả danh sách (khi đó API dùng mặc định của DB).
export function ReminderField({
  def,
  id,
  values,
  error,
  changed,
  creating,
  disabled,
  onChange,
}: ReminderFieldProps) {
  const labelId = `${id}-label`;
  const minRows = creating ? 0 : 1;
  const hint = `Từ 1 đến ${REMINDER_LIMITS.maxItems} mốc, mỗi mốc từ ${REMINDER_LIMITS.minHours} đến ${REMINDER_LIMITS.maxHours} giờ, không trùng nhau.${creating ? ' Có thể để trống.' : ''}`;
  return (
    <FieldFrame
      def={def}
      id={id}
      hint={hint}
      error={error}
      changed={changed}
      required={false}
      labelId={labelId}
    >
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy(id, error)}
        className="flex flex-col gap-2"
      >
        {values.map((value, index) => (
          // Khoá theo vị trí: các ô không có định danh riêng và người dùng sửa tại chỗ
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className={`${INPUT} ${borderOf(error)}`}
              value={value}
              disabled={disabled}
              aria-label={`Mốc nhắc lịch ${index + 1} (giờ)`}
              aria-invalid={error !== undefined}
              onChange={(event) =>
                onChange(
                  values.map((item, position) =>
                    position === index ? event.currentTarget.value : item,
                  ),
                )
              }
            />
            <span className="text-xs text-gray-500">giờ</span>
            <button
              type="button"
              className="inline-flex size-[35px] items-center justify-center rounded-[9.375px] border border-gray-300 bg-white text-gray-600 disabled:opacity-50"
              disabled={disabled || values.length <= minRows}
              aria-label={`Xoá mốc nhắc lịch ${index + 1}`}
              onClick={() =>
                onChange(values.filter((_, position) => position !== index))
              }
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="inline-flex h-[35px] w-fit items-center gap-1.5 rounded-[9.375px] border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 disabled:opacity-50"
          disabled={disabled || values.length >= REMINDER_LIMITS.maxItems}
          onClick={() => onChange([...values, ''])}
        >
          <Plus size={15} aria-hidden="true" />
          Thêm mốc
        </button>
      </div>
    </FieldFrame>
  );
}
