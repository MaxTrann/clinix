import { useId, type RefObject } from 'react';
import { DIALOG_FIELD_BORDER } from './action-dialog';

// Ô lý do bắt buộc của hộp đổi trạng thái: `Lý do hủy *` của Lễ tân (booking F9, Figma `490:2`) và `Lý do *` của override (F10). Chuyển ra `common/` ở F10 để hai hộp không chép nhau.
// Ô nhiều dòng, dấu `*` ẩn với trình đọc màn hình (`aria-required` thay vào đó), KHÔNG `maxLength` (cắt thầm lúc dán là nói dối người dùng; luật ở `status-reason.ts`). Lời báo dưới ô
// do nơi gọi truyền (`error`). `readOnly` (không `disabled`) khi đang gửi hay đã dừng: ô vẫn nhận Tab nên bẫy tiêu điểm của hộp không bị rỗng.
export function ReasonField({
  label,
  value,
  onChange,
  error,
  locked,
  fieldRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  locked: boolean;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const fieldId = useId();
  return (
    <div className="pt-3">
      <label
        htmlFor={`${fieldId}-reason`}
        className="block pb-1.5 text-xs font-medium text-gray-700"
      >
        {label}{' '}
        <span aria-hidden="true" className="text-danger-strong">
          *
        </span>
      </label>
      <textarea
        id={`${fieldId}-reason`}
        ref={fieldRef}
        rows={3}
        value={value}
        readOnly={locked}
        aria-required="true"
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${fieldId}-error`}
        onChange={(event) => onChange(event.target.value)}
        className={`block w-full rounded-xl px-3 py-2 text-sm text-gray-900 ${DIALOG_FIELD_BORDER} ${error === null ? '' : 'border-danger-strong'}`}
      />
      {error !== null && (
        <p
          id={`${fieldId}-error`}
          role="alert"
          className="pt-1.5 text-xs text-danger-strong"
        >
          {error}
        </p>
      )}
    </div>
  );
}
