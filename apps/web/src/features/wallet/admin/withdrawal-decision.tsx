import { useId, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { formatVnd } from '../../../shared/money/format-vnd';
import {
  approveWithdrawal,
  rejectWithdrawal,
  type AdminWithdrawalDetail,
} from './admin-withdrawal-api';
import { FINANCE_TEXT, REJECT_REASON_MAX } from './finance-text';

// Nút `Duyệt yêu cầu` / `Từ chối` và hai hộp xác nhận của ngăn chi tiết (payment F7; Figma `566:2`, `567:2`, `581:2`). Chỉ dựng khi yêu cầu đang `ChoDuyet` (WQL-07; ngăn chi tiết quyết định).
//  - Gửi: nút vô hiệu và khoá bằng `useRef` nên bấm đúp chỉ MỘT lời gọi (WQL-02).
//  - Từ chối: lý do BẮT BUỘC, 1 đến 200 ký tự sau khi cắt khoảng trắng (Trung chốt 19/11/2026), gửi ở `ghiChu`. Duyệt: thân rỗng.
//  - Kết quả báo lên ngăn chi tiết bằng `onSettled`: thành công, `YEU_CAU_DA_XU_LY` (người khác đã xử lý), hết giờ hay mất mạng ⇒ ngăn tải lại dữ liệu
//    (KHÔNG tự gửi lại lệnh). Lỗi khác ⇒ giữ hộp và lý do đã nhập để người dùng thử lại.

export interface DecisionNotice {
  tone: 'success' | 'warning' | 'danger';
  message: string;
}

type Mode = 'approve' | 'reject' | null;

/** Lỗi gửi ⇒ câu báo, và có cần tải lại dữ liệu (trạng thái máy chủ có thể đã đổi) hay không. */
function noticeFrom(error: unknown): {
  notice: DecisionNotice;
  reload: boolean;
} {
  if (error instanceof TimeoutError || error instanceof NetworkError)
    return {
      notice: { tone: 'warning', message: FINANCE_TEXT.uncertain },
      reload: true,
    };
  if (error instanceof ApiError && error.maLoi === 'YEU_CAU_DA_XU_LY')
    return {
      notice: { tone: 'warning', message: FINANCE_TEXT.alreadyHandled },
      reload: true,
    };
  if (error instanceof ApiError && error.maLoi === 'KHONG_TIM_THAY')
    return {
      notice: { tone: 'danger', message: FINANCE_TEXT.notFound },
      reload: true,
    };
  return {
    notice: { tone: 'danger', message: FINANCE_TEXT.genericError },
    reload: false,
  };
}

export function WithdrawalDecision({
  request,
  onSettled,
}: {
  request: AdminWithdrawalDetail;
  /** `reload` = ngăn và danh sách cần tải lại. */
  onSettled: (notice: DecisionNotice, reload: boolean) => void;
}) {
  const reasonId = useId();
  const hintId = `${reasonId}-hint`;
  const errorId = `${reasonId}-error`;
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inFlight = useRef(false);
  const amount = formatVnd(request.soTien);

  const open = (next: Mode) => {
    setMode(next);
    setFailure(null);
    setReasonError(null);
  };

  const send = async (work: () => Promise<unknown>, success: string) => {
    inFlight.current = true;
    setSending(true);
    setFailure(null);
    try {
      await work();
      onSettled({ tone: 'success', message: success }, true);
      return;
    } catch (caught) {
      const { notice, reload } = noticeFrom(caught);
      if (reload) {
        onSettled(notice, true);
        return;
      }
      setFailure(notice.message);
    }
    inFlight.current = false;
    setSending(false);
  };

  const approve = () => {
    if (inFlight.current) return;
    void send(() => approveWithdrawal(request.maYeuCau), FINANCE_TEXT.approved);
  };

  const reject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const text = reason.trim();
    if (text === '') {
      setReasonError(FINANCE_TEXT.reasonRequired);
      return;
    }
    if (text.length > REJECT_REASON_MAX) {
      setReasonError(FINANCE_TEXT.reasonTooLong(REJECT_REASON_MAX));
      return;
    }
    void send(
      () => rejectWithdrawal(request.maYeuCau, text),
      FINANCE_TEXT.rejected,
    );
  };

  const failureBox = failure !== null && (
    <p
      role="alert"
      className="mt-[10px] rounded-[8px] border border-danger-line bg-danger-soft px-[12px] py-[8px] text-[13px] text-danger-strong"
    >
      {failure}
    </p>
  );

  if (mode === null)
    return (
      <div className="grid grid-cols-2 gap-[10px]">
        <button
          type="button"
          onClick={() => open('approve')}
          className="h-[37px] rounded-[10px] bg-[#0e8fb9] text-[13px] font-semibold text-white"
        >
          {FINANCE_TEXT.approve}
        </button>
        <button
          type="button"
          onClick={() => open('reject')}
          className="h-[37px] rounded-[10px] border border-red-200 bg-red-50 text-[13px] font-semibold text-red-600"
        >
          {FINANCE_TEXT.reject}
        </button>
      </div>
    );

  if (mode === 'approve')
    return (
      <section
        aria-label={FINANCE_TEXT.approveConfirm}
        className="rounded-[12px] border border-cyan-200 bg-cyan-50 p-[14px]"
      >
        <p className="text-[13px] font-semibold text-[#0e6f8f]">
          {FINANCE_TEXT.approveTitle(amount)}
        </p>
        <ul className="list-disc pt-[8px] pl-[16px] text-[11px] leading-[16px] text-[#0e6f8f]">
          {FINANCE_TEXT.approvePoints(amount).map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        {failureBox}
        <div className="grid grid-cols-2 gap-[8px] pt-[12px]">
          <button
            type="button"
            disabled={sending}
            onClick={approve}
            className="h-[33px] rounded-[8px] bg-[#0e8fb9] text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {sending ? FINANCE_TEXT.sending : FINANCE_TEXT.approveConfirm}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => open(null)}
            className="h-[33px] rounded-[8px] border border-gray-200 bg-white text-[13px] text-gray-700 disabled:opacity-60"
          >
            {FINANCE_TEXT.cancel}
          </button>
        </div>
      </section>
    );

  return (
    <form
      noValidate
      onSubmit={reject}
      aria-label={FINANCE_TEXT.rejectConfirm}
      className="rounded-[12px] border border-red-200 bg-red-50 p-[14px]"
    >
      <label
        htmlFor={reasonId}
        className="block text-[13px] font-semibold text-red-700"
      >
        {FINANCE_TEXT.rejectReasonLabel} <span aria-hidden="true">*</span>
      </label>
      <p id={hintId} className="pt-[6px] text-[11px] text-red-600">
        {FINANCE_TEXT.rejectReasonHint}
      </p>
      <textarea
        id={reasonId}
        rows={3}
        required
        value={reason}
        disabled={sending}
        placeholder={FINANCE_TEXT.rejectReasonPlaceholder}
        onChange={(event) => {
          setReason(event.target.value);
          setReasonError(null);
        }}
        aria-invalid={reasonError !== null}
        aria-describedby={
          reasonError !== null ? `${errorId} ${hintId}` : hintId
        }
        className="mt-[8px] w-full resize-none rounded-[8px] border border-gray-200 bg-white px-[10px] py-[8px] text-[13px] text-gray-900"
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
      {failureBox}
      <div className="grid grid-cols-2 gap-[8px] pt-[12px]">
        <button
          type="submit"
          disabled={sending}
          className="h-[33px] rounded-[8px] bg-red-600 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {sending ? FINANCE_TEXT.sending : FINANCE_TEXT.rejectConfirm}
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => open(null)}
          className="h-[33px] rounded-[8px] border border-gray-200 bg-white text-[13px] text-gray-700 disabled:opacity-60"
        >
          {FINANCE_TEXT.cancel}
        </button>
      </div>
    </form>
  );
}
