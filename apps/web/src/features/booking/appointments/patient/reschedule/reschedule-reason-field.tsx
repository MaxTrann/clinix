import { useId, type RefObject } from 'react';

interface RescheduleReasonFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  // Lời báo dưới ô (null = hợp lệ hay chưa kiểm); hiện NGAY dưới ô
  error: string | null;
  // Bộ đếm đã dựng chữ ("12/500 ký tự")
  counter: string;
  // Đang gửi: `readOnly` (không `disabled`) để ô vẫn nhận Tab và chữ đã gõ còn nguyên
  locked: boolean;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
}

// Ô lý do BẮT BUỘC của đổi lịch (reschedule F2, WDH-04; Lễ tân đổi hộ F3 dùng lại). Chỉ giao diện: luật ở `reschedule-reason-rules.ts`. KHÔNG `maxLength`: giới hạn cứng sẽ cắt thầm đoạn dán dài; lỗi và bộ
// đếm hiện dưới ô thay vào đó. `autoComplete="off"`: lý do có thể chứa thông tin cá nhân, không để trình duyệt gợi ý hay nhớ lại. Dấu `*` ẩn với trình đọc màn hình (`aria-required` thay vào đó). Giá trị chỉ nằm
// ở state của form (không storage, không URL, không log).
export function RescheduleReasonField({
  label,
  hint,
  value,
  onChange,
  error,
  counter,
  locked,
  fieldRef,
}: RescheduleReasonFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const counterId = `${id}-counter`;
  const errorId = `${id}-error`;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <label htmlFor={id} className="block font-semibold text-gray-900">
        {label}{' '}
        <span aria-hidden="true" className="text-danger-strong">
          *
        </span>
      </label>
      <p id={hintId} className="mt-1 text-sm text-gray-600">
        {hint}
      </p>
      <textarea
        id={id}
        ref={fieldRef}
        rows={4}
        value={value}
        readOnly={locked}
        autoComplete="off"
        aria-required="true"
        aria-invalid={error !== null}
        aria-describedby={`${hintId} ${counterId}${error === null ? '' : ` ${errorId}`}`}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-3 block w-full resize-y rounded-xl border px-3 py-2 text-gray-900 ${error === null ? 'border-gray-500' : 'border-danger-strong'}`}
      />
      <p id={counterId} className="mt-1 text-right text-xs text-gray-600">
        {counter}
      </p>
      {error !== null && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-sm text-danger-strong"
        >
          {error}
        </p>
      )}
    </section>
  );
}
