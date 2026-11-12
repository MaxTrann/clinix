import { useRef, useState, type FormEvent, type RefObject } from 'react';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../../shared/api/errors';
import { errorMessageFor } from '../../../../shared/api/error-message';
import {
  REJECT_REASON_MAX,
  rejectAdminLeaveRequest,
  type AdminLeaveItem,
} from '../../api/admin-leave-api';
import { ModalFrame } from '../../components/modal-frame';
import {
  checkRejectReason,
  type RejectReasonProblem,
} from './approvals-format';

const PROBLEM_MESSAGES: Record<RejectReasonProblem, string> = {
  empty: 'Vui lòng nhập lý do từ chối.',
  tooLong: `Lý do tối đa ${REJECT_REASON_MAX} ký tự.`,
  control: 'Lý do không được chứa ký tự điều khiển (ví dụ xuống dòng).',
};

// Chọn câu theo `maLoi`, không dùng `thongBao` của server (PLAN 5.14; câu [đề xuất]).
const BUSINESS_MESSAGES: Record<string, string> = {
  LY_DO_TU_CHOI_KHONG_HOP_LE: `Vui lòng nhập lý do từ chối (tối đa ${REJECT_REASON_MAX} ký tự).`,
  YEU_CAU_DA_XU_LY:
    'Yêu cầu này đã được xử lý trước đó. Danh sách đã được tải lại.',
  KHONG_TIM_THAY: 'Yêu cầu không còn tồn tại hoặc nằm ngoài phạm vi của bạn.',
};
// Hai mã này nghĩa là yêu cầu không còn để từ chối được: dừng ở thông báo và tải lại danh sách (DH-08)
const GONE_CODES = ['YEU_CAU_DA_XU_LY', 'KHONG_TIM_THAY'];

const UNCERTAIN_MESSAGE =
  'Chưa rõ yêu cầu đã được từ chối chưa (mất kết nối hoặc quá thời gian chờ). Hãy đóng hộp thoại, kiểm tra trạng thái trong danh sách rồi thử lại nếu cần.';

interface RejectDialogProps {
  item: AdminLeaveItem;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onRejected: () => void;
  // Yêu cầu đã bị xử lý/không còn: nơi gọi tải lại danh sách ngay
  onGone: () => void;
}

// Hộp "Từ chối yêu cầu nghỉ phép" (Figma `584:2`; WA-09): lý do bắt buộc, nút "Từ chối" vô hiệu khi lý do trống.
export function RejectDialog({
  item,
  returnFocusRef,
  onClose,
  onRejected,
  onGone,
}: RejectDialogProps) {
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  const problem = checkRejectReason(reason);
  // Chỉ báo "quá dài/ký tự lạ" khi đã có chữ; ô trống chỉ vô hiệu nút (Figma không hiện lỗi)
  const shownProblem = problem === null || problem === 'empty' ? null : problem;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Chặn bấm đúp: yêu cầu từ chối không được gửi hai lần
    if (submitting.current || problem !== null || gone) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await rejectAdminLeaveRequest(item.yeuCauNghiPhepId, reason.trim());
      onRejected();
    } catch (failure) {
      if (failure instanceof ApiError) {
        setError(BUSINESS_MESSAGES[failure.maLoi] ?? errorMessageFor(failure));
        if (GONE_CODES.includes(failure.maLoi)) {
          setGone(true);
          onGone();
        }
      } else if (
        failure instanceof NetworkError ||
        failure instanceof TimeoutError
      ) {
        // Không biết server đã nhận chưa nên không tự gửi lại (như lúc gửi yêu cầu nghỉ)
        setError(UNCERTAIN_MESSAGE);
      } else {
        setError(errorMessageFor(failure));
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <ModalFrame
      title="Từ chối yêu cầu nghỉ phép"
      initialFocusRef={reasonRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      busy={pending}
      widthClass="max-w-md"
    >
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex min-h-0 flex-col"
      >
        <div className="flex flex-col gap-3 px-6 py-5">
          <p className="text-sm text-gray-600">
            {item.bacSi.hoTen} · {item.chiNhanh.ten}
          </p>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
            <span>
              Lý do từ chối <span className="text-danger">*</span>
            </span>
            <textarea
              ref={reasonRef}
              rows={3}
              value={reason}
              disabled={pending || gone}
              aria-invalid={shownProblem !== null ? true : undefined}
              aria-describedby={
                shownProblem !== null ? 'reject-reason-error' : undefined
              }
              placeholder="Nhập lý do từ chối..."
              onChange={(event) => {
                setReason(event.target.value);
                if (!gone) setError(null);
              }}
              className="min-h-24 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 placeholder:text-gray-400 disabled:bg-gray-50"
            />
          </label>
          {shownProblem !== null && (
            <p id="reject-reason-error" className="text-sm text-danger-strong">
              {PROBLEM_MESSAGES[shownProblem]}
            </p>
          )}
          {error !== null && (
            <p
              role="alert"
              className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
            >
              {error}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="min-h-11 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            {gone ? 'Đóng' : 'Hủy'}
          </button>
          <button
            type="submit"
            disabled={pending || problem !== null || gone}
            className="min-h-11 rounded-lg bg-danger-strong text-sm font-semibold text-white hover:opacity-90 disabled:bg-gray-200 disabled:text-gray-500"
          >
            {pending ? 'Đang gửi…' : 'Từ chối'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
