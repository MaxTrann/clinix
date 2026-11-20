import { useId, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { formatVnd } from '../../../shared/money/format-vnd';
import {
  creditUnpostedTopup,
  markTopupUnprocessable,
  type UnpostedTopupItem,
} from './unposted-topup-api';
import {
  UNPOSTED_TEXT,
  UNPROCESSABLE_REASON_MAX,
  UNPROCESSABLE_REASON_MIN,
} from './unposted-topup-text';
import type { DecisionNotice } from './withdrawal-decision';

// Nội dung ngăn bên của tab "Nạp ví chưa cộng" (payment F9): bước xác nhận `Cộng ví`, hoặc ô lý do của `Không thể xử lý` (PLAN 5.4 bước 6; 2.4 NVC b9, b10, A4).
//  - Gửi: nút vô hiệu và khoá bằng `useRef` nên bấm đúp chỉ MỘT lời gọi.
//  - `Cộng ví` gửi thân rỗng: số tiền hiện ở đây là số máy chủ trả, không phải số web gửi đi.
//  - Lý do: 10 đến 255 ký tự sau khi cắt khoảng trắng (khớp B15). Máy chủ vẫn có thể từ chối (chữ giống bí mật) ⇒ lỗi dưới ô.
//  - Kết quả báo lên tab bằng `onSettled`: thành công, `GIAO_DICH_NAP_DA_DOI_SOAT`, 404, hết giờ hay mất mạng ⇒ tab đóng ngăn và tải lại danh sách (KHÔNG tự gửi lại).
//    Lỗi khác ⇒ giữ ngăn và lý do đã nhập để thử lại.

export type UnpostedMode = 'credit' | 'unprocessable';

function settledFrom(error: unknown): DecisionNotice | null {
  if (error instanceof TimeoutError || error instanceof NetworkError)
    return { tone: 'warning', message: UNPOSTED_TEXT.uncertain };
  if (error instanceof ApiError && error.maLoi === 'GIAO_DICH_NAP_DA_DOI_SOAT')
    return { tone: 'warning', message: UNPOSTED_TEXT.alreadyCredited };
  if (error instanceof ApiError && error.maLoi === 'KHONG_TIM_THAY')
    return { tone: 'warning', message: UNPOSTED_TEXT.notInQueue };
  return null;
}

const isReasonRejected = (error: unknown) =>
  error instanceof ApiError &&
  (error.loi ?? []).some((field) => field.truong === 'lyDo');

function Summary({ topup }: { topup: UnpostedTopupItem }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-[12px] gap-y-[6px] rounded-[12px] border border-gray-200 bg-gray-50 p-[14px] text-[13px]">
      <dt className="text-gray-500">{UNPOSTED_TEXT.codeLabel}</dt>
      <dd className="font-mono text-gray-800">#{topup.maGiaoDich}</dd>
      <dt className="text-gray-500">{UNPOSTED_TEXT.patientLabel}</dt>
      <dd className="text-gray-900">{topup.benhNhan.hoTen}</dd>
      <dt className="text-gray-500">{UNPOSTED_TEXT.amountLabel}</dt>
      <dd className="font-bold text-success">{formatVnd(topup.soTien)}</dd>
    </dl>
  );
}

export function UnpostedTopupAction({
  topup,
  mode,
  onSettled,
  onCancel,
}: {
  topup: UnpostedTopupItem;
  mode: UnpostedMode;
  /** Thao tác đã kết thúc (hay trạng thái máy chủ có thể đã đổi): tab đóng ngăn, hiện câu và tải lại danh sách. */
  onSettled: (notice: DecisionNotice) => void;
  onCancel: () => void;
}) {
  const reasonId = useId();
  const hintId = `${reasonId}-hint`;
  const errorId = `${reasonId}-error`;
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const amount = formatVnd(topup.soTien);

  const send = async (work: () => Promise<unknown>, success: string) => {
    inFlight.current = true;
    setSending(true);
    setFailure(null);
    try {
      await work();
      onSettled({ tone: 'success', message: success });
      return;
    } catch (caught) {
      const settled = settledFrom(caught);
      if (settled !== null) {
        onSettled(settled);
        return;
      }
      if (isReasonRejected(caught))
        setReasonError(UNPOSTED_TEXT.reasonRequired);
      else setFailure(UNPOSTED_TEXT.genericError);
    }
    inFlight.current = false;
    setSending(false);
  };

  const credit = () => {
    if (inFlight.current) return;
    void send(
      () => creditUnpostedTopup(topup.maGiaoDich),
      UNPOSTED_TEXT.credited,
    );
  };

  const markUnprocessable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const text = reason.trim();
    if (text.length < UNPROCESSABLE_REASON_MIN) {
      setReasonError(UNPOSTED_TEXT.reasonRequired);
      return;
    }
    if (text.length > UNPROCESSABLE_REASON_MAX) {
      setReasonError(UNPOSTED_TEXT.reasonTooLong);
      return;
    }
    void send(
      () => markTopupUnprocessable(topup.maGiaoDich, text),
      UNPOSTED_TEXT.markedUnprocessable,
    );
  };

  const failureBox = failure !== null && (
    <p
      role="alert"
      className="rounded-[8px] border border-danger-line bg-danger-soft px-[12px] py-[8px] text-[13px] text-danger-strong"
    >
      {failure}
    </p>
  );
  const cancelButton = (
    <button
      type="button"
      disabled={sending}
      onClick={onCancel}
      className="h-[37px] rounded-[10px] border border-gray-300 bg-white text-[13px] text-gray-700 disabled:opacity-60"
    >
      {UNPOSTED_TEXT.cancel}
    </button>
  );

  if (mode === 'credit')
    return (
      <div className="flex flex-col gap-[14px]">
        <Summary topup={topup} />
        <ul className="list-disc rounded-[12px] border border-cyan-200 bg-cyan-50 py-[12px] pr-[14px] pl-[30px] text-[12px] leading-[18px] text-cyan-900">
          {UNPOSTED_TEXT.creditPoints(amount).map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        {failureBox}
        <div className="grid grid-cols-2 gap-[10px]">
          <button
            type="button"
            disabled={sending}
            onClick={credit}
            className="h-[37px] rounded-[10px] bg-brand-strong text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {sending ? UNPOSTED_TEXT.sending : UNPOSTED_TEXT.creditConfirm}
          </button>
          {cancelButton}
        </div>
      </div>
    );

  return (
    <form
      noValidate
      onSubmit={markUnprocessable}
      className="flex flex-col gap-[14px]"
    >
      <Summary topup={topup} />
      <div>
        <label
          htmlFor={reasonId}
          className="block text-[13px] font-semibold text-gray-800"
        >
          {UNPOSTED_TEXT.reasonLabel} <span aria-hidden="true">*</span>
        </label>
        <p id={hintId} className="pt-[4px] text-[11px] text-gray-500">
          {UNPOSTED_TEXT.reasonHint}
        </p>
        <textarea
          id={reasonId}
          rows={4}
          required
          value={reason}
          disabled={sending}
          placeholder={UNPOSTED_TEXT.reasonPlaceholder}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError(null);
          }}
          aria-invalid={reasonError !== null}
          aria-describedby={
            reasonError !== null ? `${errorId} ${hintId}` : hintId
          }
          className="mt-[8px] w-full resize-none rounded-[8px] border border-gray-500 bg-white px-[10px] py-[8px] text-[13px] text-gray-900"
        />
        {reasonError !== null && (
          <p
            id={errorId}
            role="alert"
            className="pt-[4px] text-[12px] text-danger"
          >
            {reasonError}
          </p>
        )}
      </div>
      {failureBox}
      <div className="grid grid-cols-2 gap-[10px]">
        <button
          type="submit"
          disabled={sending}
          className="h-[37px] rounded-[10px] bg-warning text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {sending ? UNPOSTED_TEXT.sending : UNPOSTED_TEXT.unprocessableConfirm}
        </button>
        {cancelButton}
      </div>
    </form>
  );
}
