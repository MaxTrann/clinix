import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CurrentAppointmentCard,
  NewAppointmentCard,
} from './current-appointment-card';
import { RescheduleReasonField } from './reschedule-reason-field';
import {
  checkRescheduleReason,
  countReasonLength,
  type ReasonError,
  type ReasonLimits,
} from './reschedule-reason-rules';
import { RESCHEDULE_TEXT } from './reschedule-text';

interface ReasonConfig extends ReasonLimits {
  label: string;
  hint: string;
}

interface RescheduleConfirmFormProps {
  // Hai mốc giờ ISO UTC, hiện theo giờ Việt Nam
  current: { thoiGian: string };
  next: { thoiGian: string };
  // Dòng nhắc dưới hai thẻ ("Bạn còn n lần tự đổi…", "Yêu cầu sẽ chuyển cho Lễ tân duyệt…", "Bệnh nhân sẽ đọc lý do này…")
  intro?: ReactNode;
  // `null` ⇒ không có ô lý do (nhánh tự đổi); có ⇒ ô BẮT BUỘC với nhãn, gợi ý và giới hạn điểm mã của nơi dùng
  reason: ReasonConfig | null;
  // Lỗi của máy chủ ở trường lý do (400); lỗi cục bộ của luật đứng trước nó
  reasonError?: string | null;
  // Đổi giá trị ⇒ tiêu điểm vào ô lý do (nơi dùng gọi khi máy chủ đòi lý do)
  focusReasonKey?: number;
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  // Chỗ cho khối lỗi hay nhắc phía trên nút; nhận hàm "gửi lại" (cùng việc với bấm nút: kiểm lý do rồi gọi `onSubmit`)
  renderNotice?: (submitNow: () => void) => ReactNode;
  // Chỉ gọi khi hợp lệ; `reason` là chữ ĐÃ chuẩn hoá (hoặc `null` khi không có ô lý do)
  onSubmit: (reason: string | null) => void;
}

function reasonMessage(error: ReasonError, limits: ReasonLimits): string {
  return error === 'control'
    ? RESCHEDULE_TEXT.reasonControl
    : RESCHEDULE_TEXT.reasonRange(limits.min, limits.max);
}

// Hai thẻ "Lịch hiện tại" → "Lịch mới": cột dọc ở màn hẹp (mũi tên xoay xuống), ba cột ở màn rộng
function Compare({
  current,
  next,
}: Pick<RescheduleConfirmFormProps, 'current' | 'next'>) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <CurrentAppointmentCard current={current} />
      <ArrowRight
        aria-hidden="true"
        className="mx-auto size-5 rotate-90 text-gray-600 md:rotate-0"
      />
      <NewAppointmentCard next={next} />
    </div>
  );
}

/**
 * Thành phần xác nhận đổi lịch DÙNG CHUNG (reschedule F2; Lễ tân đổi hộ F3 dùng lại): hai thẻ "cũ → mới", dòng nhắc, ô lý do tuỳ chọn và nút gửi. Chỉ nhận props, KHÔNG gọi API, không biết vai trò.
 * Chữ đã gõ nằm ở state của chính form nên lỗi từ máy chủ không làm mất nội dung. Lỗi quá ngắn chỉ hiện sau lần bấm gửi đầu; quá dài hay ký tự điều khiển hiện ngay khi gõ. Bấm gửi khi chưa hợp lệ ⇒ không
 * gọi `onSubmit`, tiêu điểm vào ô. Đang gửi: nút `disabled`, ô `readOnly`. Chốt "chỉ gửi một lần" khi bấm đúp là việc của nơi dùng (`useSubmitReschedule`): hai cú bấm trong cùng một nhịp render
 * đều thấy `submitting = false`.
 */
export function RescheduleConfirmForm({
  current,
  next,
  intro,
  reason,
  reasonError = null,
  focusReasonKey = 0,
  submitLabel,
  submittingLabel,
  submitting,
  renderNotice,
  onSubmit,
}: RescheduleConfirmFormProps) {
  const [text, setText] = useState('');
  const [attempted, setAttempted] = useState(false);
  // Bấm gửi khi chưa hợp lệ ⇒ xin đưa tiêu điểm vào ô. Xin bằng state (không chạm ref trong `submitNow`, hàm này còn được đưa cho `renderNotice` lúc vẽ).
  const [focusAsked, setFocusAsked] = useState(0);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const focusKey = focusReasonKey + focusAsked;

  useEffect(() => {
    if (focusKey > 0) fieldRef.current?.focus();
  }, [focusKey]);

  const checked = reason === null ? null : checkRescheduleReason(text, reason);
  const showLocal =
    checked !== null &&
    !checked.ok &&
    (attempted || checked.error !== 'tooShort');
  const localError =
    reason !== null && checked !== null && !checked.ok && showLocal
      ? reasonMessage(checked.error, reason)
      : null;

  function submitNow() {
    if (submitting) return;
    if (reason === null) {
      onSubmit(null);
      return;
    }
    const result = checkRescheduleReason(text, reason);
    if (!result.ok) {
      setAttempted(true);
      setFocusAsked((n) => n + 1);
      return;
    }
    onSubmit(result.value);
  }

  return (
    <div aria-busy={submitting} className="flex flex-col gap-4">
      <Compare current={current} next={next} />
      {intro !== undefined && (
        <p className="rounded-xl border border-cyan-200 bg-brand-soft px-4 py-3 text-sm text-cyan-900">
          {intro}
        </p>
      )}
      {reason !== null && (
        <RescheduleReasonField
          label={reason.label}
          hint={reason.hint}
          value={text}
          onChange={setText}
          error={localError ?? reasonError}
          counter={RESCHEDULE_TEXT.reasonCount(
            countReasonLength(text),
            reason.max,
          )}
          locked={submitting}
          fieldRef={fieldRef}
        />
      )}
      {renderNotice?.(submitNow)}
      <button
        type="button"
        disabled={submitting}
        onClick={submitNow}
        className="min-h-11 w-full rounded-xl bg-brand-strong px-5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}
