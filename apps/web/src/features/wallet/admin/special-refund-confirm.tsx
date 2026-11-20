import { useRef, useState } from 'react';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { formatVnd, isDecimalAmount } from '../../../shared/money/format-vnd';
import {
  createSpecialRefund,
  type RefundablePayment,
} from './special-refund-api';
import { SPECIAL_REFUND_TEXT } from './special-refund-text';
import type { DecisionNotice } from './withdrawal-decision';

// Nội dung ngăn bên "Xác nhận hoàn tiền đặc biệt" (payment F8; PLAN 5.6.2: màn xác nhận là bước Ở WEB, máy chủ chỉ có MỘT lời gọi ghi).
//  - Gửi: nút vô hiệu và khoá bằng `useRef` nên bấm đúp chỉ MỘT lời gọi.
//  - Kết quả báo lên tab bằng `onSettled`:
//    thành công, `DA_HOAN_DAC_BIET`, vượt trần, 404, hết giờ hay mất mạng ⇒ tab đóng ngăn, hiện câu và tải lại danh sách (KHÔNG tự gửi lại);
//    máy chủ từ chối số tiền hay lý do ⇒ tab đóng ngăn và báo lỗi dưới ô tương ứng để sửa. Lỗi khác ⇒ giữ ngăn để thử lại.

export type SpecialRefundOutcome =
  | { kind: 'done'; notice: DecisionNotice; resetForm: boolean }
  | { kind: 'field'; field: 'soTien' | 'lyDo' };

export interface SpecialRefundDraft {
  payment: RefundablePayment;
  soTien: string;
  lyDo: string;
}

const warning = (message: string): SpecialRefundOutcome => ({
  kind: 'done',
  notice: { tone: 'warning', message },
  resetForm: false,
});

// Số trần trong thân 409 do máy chủ trả; hình dạng lạ thì không hiện số (không tự tính, WQL-05)
function capFrom(error: ApiError): string | null {
  const detail = error.chiTiet;
  if (typeof detail !== 'object' || detail === null) return null;
  const cap = (detail as Record<string, unknown>).conCoTheHoan;
  return typeof cap === 'string' && isDecimalAmount(cap)
    ? formatVnd(cap)
    : null;
}

function outcomeFrom(error: unknown): SpecialRefundOutcome | null {
  if (error instanceof TimeoutError || error instanceof NetworkError)
    return warning(SPECIAL_REFUND_TEXT.uncertain);
  if (!(error instanceof ApiError)) return null;
  switch (error.maLoi) {
    case 'DA_HOAN_DAC_BIET':
      return warning(SPECIAL_REFUND_TEXT.alreadyRefunded);
    case 'SO_TIEN_HOAN_VUOT_QUA_DA_THANH_TOAN':
      return warning(SPECIAL_REFUND_TEXT.exceeds(capFrom(error)));
    case 'KHONG_TIM_THAY':
      return warning(SPECIAL_REFUND_TEXT.notRefundable);
  }
  const fields = (error.loi ?? []).map((field) => field.truong);
  if (fields.includes('soTien')) return { kind: 'field', field: 'soTien' };
  if (fields.includes('lyDo')) return { kind: 'field', field: 'lyDo' };
  return null;
}

export function SpecialRefundConfirm({
  draft,
  onSettled,
  onCancel,
}: {
  draft: SpecialRefundDraft;
  onSettled: (outcome: SpecialRefundOutcome) => void;
  onCancel: () => void;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const { payment } = draft;
  const amount = formatVnd(draft.soTien);

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setFailure(null);
    try {
      await createSpecialRefund({
        maGiaoDich: payment.maGiaoDich,
        soTien: draft.soTien,
        lyDo: draft.lyDo,
      });
      onSettled({
        kind: 'done',
        notice: {
          tone: 'success',
          message: SPECIAL_REFUND_TEXT.refunded(amount),
        },
        resetForm: true,
      });
      return;
    } catch (caught) {
      const outcome = outcomeFrom(caught);
      if (outcome !== null) {
        onSettled(outcome);
        return;
      }
      setFailure(SPECIAL_REFUND_TEXT.genericError);
    }
    inFlight.current = false;
    setSending(false);
  };

  return (
    <div className="flex flex-col gap-[14px]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-[12px] gap-y-[6px] rounded-[12px] border border-gray-200 bg-gray-50 p-[14px] text-[13px]">
        <dt className="text-gray-500">{SPECIAL_REFUND_TEXT.codeOfPayment}</dt>
        <dd className="font-mono text-gray-800">#{payment.maGiaoDich}</dd>
        <dt className="text-gray-500">{SPECIAL_REFUND_TEXT.appointment}</dt>
        <dd className="font-mono text-gray-800">{payment.maLichHen}</dd>
        <dt className="text-gray-500">{SPECIAL_REFUND_TEXT.paidLabel}</dt>
        <dd className="text-gray-900">{formatVnd(payment.soTien)}</dd>
        <dt className="text-gray-500">{SPECIAL_REFUND_TEXT.refundedLabel}</dt>
        <dd className="text-gray-900">{formatVnd(payment.daHoan)}</dd>
        <dt className="text-gray-500">{SPECIAL_REFUND_TEXT.refundableLabel}</dt>
        <dd className="text-gray-900">{formatVnd(payment.conCoTheHoan)}</dd>
        <dt className="text-gray-500">{SPECIAL_REFUND_TEXT.refundAmount}</dt>
        <dd className="font-bold text-success">{amount}</dd>
        <dt className="text-gray-500">{SPECIAL_REFUND_TEXT.reason}</dt>
        <dd className="break-words whitespace-pre-wrap text-gray-900">
          {draft.lyDo}
        </dd>
      </dl>
      <ul className="list-disc rounded-[12px] border border-cyan-200 bg-cyan-50 py-[12px] pr-[14px] pl-[30px] text-[12px] leading-[18px] text-cyan-900">
        {SPECIAL_REFUND_TEXT.confirmPoints(amount).map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {failure !== null && (
        <p
          role="alert"
          className="rounded-[8px] border border-danger-line bg-danger-soft px-[12px] py-[8px] text-[13px] text-danger-strong"
        >
          {failure}
        </p>
      )}
      <div className="grid grid-cols-2 gap-[10px]">
        <button
          type="button"
          disabled={sending}
          onClick={() => void confirm()}
          className="h-[37px] rounded-[10px] bg-brand-strong text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {sending ? SPECIAL_REFUND_TEXT.sending : SPECIAL_REFUND_TEXT.confirm}
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={onCancel}
          className="h-[37px] rounded-[10px] border border-gray-300 bg-white text-[13px] text-gray-700 disabled:opacity-60"
        >
          {SPECIAL_REFUND_TEXT.back}
        </button>
      </div>
    </div>
  );
}
