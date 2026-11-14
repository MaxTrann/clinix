import { useId, type RefObject } from 'react';
import {
  VISIT_REASON_MESSAGES,
  type VisitReasonError,
} from './visit-reason-rules';

interface VisitReasonFieldProps {
  value: string;
  onChange: (value: string) => void;
  // Lỗi của luật `checkVisitReason` (null = hợp lệ hay để trống); hiện NGAY dưới ô khi có
  error: VisitReasonError | null;
  // Để `Tiếp tục` đưa tiêu điểm về ô khi lý do không hợp lệ
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

// Ô "Lý do khám (không bắt buộc)" (Figma `449:2`). KHÔNG `maxLength`: giới hạn cứng sẽ cắt thầm đoạn dán dài và Figma không có bộ đếm; lỗi hiện dưới ô thay vào đó.
// `autoComplete="off"`: lý do khám là thông tin sức khoẻ, không để trình duyệt gợi ý hay nhớ lại. Giá trị chỉ nằm ở state của Bước 4 (không storage, không URL, không log).
export function VisitReasonField({
  value,
  onChange,
  error,
  textareaRef,
}: VisitReasonFieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <label htmlFor={id} className="block font-semibold text-gray-900">
        Lý do khám{' '}
        <span className="text-sm font-normal text-gray-600">
          (không bắt buộc)
        </span>
      </label>
      <p id={helpId} className="mt-1 text-sm text-gray-600">
        Mô tả ngắn triệu chứng hoặc điều bạn muốn trao đổi với bác sĩ.
      </p>
      <textarea
        id={id}
        ref={textareaRef}
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        placeholder="Ví dụ: đau lưng 2 tuần, khó ngủ..."
        aria-invalid={error !== null}
        aria-describedby={error === null ? helpId : `${helpId} ${errorId}`}
        className="mt-3 block w-full resize-y rounded-xl border border-gray-500 px-3 py-2 text-gray-900"
      />
      {error !== null && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 text-sm text-danger-strong"
        >
          {VISIT_REASON_MESSAGES[error]}
        </p>
      )}
    </section>
  );
}
