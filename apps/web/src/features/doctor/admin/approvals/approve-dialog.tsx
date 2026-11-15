import { useRef, useState, type RefObject } from 'react';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../../shared/api/errors';
import { errorMessageFor } from '../../../../shared/api/error-message';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import {
  approveAdminLeaveRequest,
  getAdminLeaveRequest,
  type AdminLeaveDetail,
  type AdminLeaveItem,
  type ApprovalOutcome,
} from '../../api/admin-leave-api';
import { ModalFrame } from '../../components/modal-frame';
import { useLoad } from '../../reception/use-reception-data';
import { formatLeaveTime } from './approvals-format';

// Chọn câu theo `maLoi`, không dùng `thongBao` của server (PLAN 5.14; câu [đề xuất]).
const BUSINESS_MESSAGES: Record<string, string> = {
  YEU_CAU_DA_XU_LY:
    'Yêu cầu này đã được xử lý trước đó. Danh sách đã được tải lại.',
  YEU_CAU_NGHI_DA_QUA_HAN:
    'Yêu cầu đã quá hạn (ngày nghỉ đã qua), chỉ có thể từ chối.',
  KHONG_TIM_THAY: 'Yêu cầu không còn tồn tại hoặc nằm ngoài phạm vi của bạn.',
};
// Cả ba mã nghĩa là yêu cầu không còn duyệt được: dừng ở thông báo và tải lại danh sách (DH-08)
const GONE_CODES = Object.keys(BUSINESS_MESSAGES);

const UNCERTAIN_MESSAGE =
  'Chưa rõ yêu cầu đã được duyệt chưa (mất kết nối hoặc quá thời gian chờ). Hãy đóng hộp thoại, kiểm tra trạng thái trong danh sách rồi thử lại nếu cần.';

interface ApproveDialogProps {
  item: AdminLeaveItem;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onApproved: (outcome: ApprovalOutcome) => void;
  // Yêu cầu đã bị xử lý/không còn: nơi gọi tải lại danh sách ngay
  onGone: () => void;
}

// Hộp "Xác nhận duyệt nghỉ phép" (Figma `585:2`; WA-10, WA-15). Figma chỉ có "Bệnh nhân nhận thông báo"; theo Q32 hộp nói thêm số lịch bị huỷ và số lịch hoàn cọc 100%.
// Số liệu lấy từ chi tiết (`GET /:id`) lúc mở hộp. Chưa tải được số thì KHÔNG cho duyệt: Admin phải biết mình sắp huỷ bao nhiêu lịch.
export function ApproveDialog({
  item,
  returnFocusRef,
  onClose,
  onApproved,
  onGone,
}: ApproveDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const detail = useLoad<AdminLeaveDetail>(
    (signal) => getAdminLeaveRequest(item.yeuCauNghiPhepId, signal),
    item.yeuCauNghiPhepId,
  );
  const loaded = detail.state.status === 'success';
  const affected =
    detail.state.status === 'success'
      ? detail.state.data.lichHenBiAnhHuong
      : null;

  async function handleConfirm() {
    // Chặn bấm đúp: yêu cầu duyệt không được gửi hai lần
    if (submitting.current || !loaded || gone) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      onApproved(await approveAdminLeaveRequest(item.yeuCauNghiPhepId));
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
        // Không biết server đã nhận chưa nên không tự gửi lại
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
      title="Xác nhận duyệt nghỉ phép"
      subtitle="Hành động này không thể hoàn tác."
      subtitleClass="text-gray-500"
      initialFocusRef={cancelRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      busy={pending}
      widthClass="max-w-md"
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-3 rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <dt className="text-gray-500">Bác sĩ</dt>
          <dd className="text-right font-medium text-gray-900">
            {item.bacSi.hoTen}
          </dd>
          <dt className="text-gray-500">Thời gian nghỉ</dt>
          <dd className="text-right font-medium text-gray-900">
            {formatLeaveTime(item)}
          </dd>
        </dl>
        {detail.state.status === 'loading' && (
          <LoadingState message="Đang tính số lịch hẹn bị ảnh hưởng…" />
        )}
        {detail.state.status === 'error' && (
          <ErrorState error={detail.state.error} onRetry={detail.retry} />
        )}
        {loaded && (
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
            <dt className="text-gray-600">Lịch hẹn sẽ bị hủy</dt>
            <dd className="text-right font-semibold text-gray-900">
              {affected?.tong ?? 0} lịch
            </dd>
            <dt className="text-gray-600">
              Lịch đã đặt cọc (hoàn 100% vào ví)
            </dt>
            <dd className="text-right font-semibold text-gray-900">
              {affected?.soCoCoc ?? 0} lịch
            </dd>
            <dt className="text-gray-600">Bệnh nhân nhận thông báo</dt>
            <dd className="text-right font-semibold text-gray-900">
              {affected?.soBenhNhan ?? 0} bệnh nhân
            </dd>
          </dl>
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
          ref={cancelRef}
          type="button"
          disabled={pending}
          onClick={onClose}
          className="min-h-11 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
        >
          {gone ? 'Đóng' : 'Hủy'}
        </button>
        <button
          type="button"
          disabled={pending || !loaded || gone}
          onClick={() => void handleConfirm()}
          className="min-h-11 rounded-lg bg-success text-sm font-semibold text-white hover:opacity-90 disabled:bg-gray-200 disabled:text-gray-500"
        >
          {pending ? 'Đang duyệt…' : 'Xác nhận duyệt'}
        </button>
      </div>
    </ModalFrame>
  );
}
