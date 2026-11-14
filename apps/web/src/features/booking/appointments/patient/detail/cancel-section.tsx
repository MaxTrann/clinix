import { useEffect, useRef, type RefObject } from 'react';
import { formatVnd } from '../../common/appointment-format';
import { isZeroAmount } from '../../common/refund-text';
import type { PatientAppointmentDetail } from '../api/patient-appointment-types';
import { CancelBox } from './cancel-box';
import { CANCEL_TEXT, DETAIL_TEXT } from './detail-messages';

import type { CancelBoxController } from './use-cancel-box';

// Khu huỷ ở cuối cột phải: nút `Hủy lịch hẹn` (chỉ khi `choPhepHuy` của chi tiết, nghĩa là theo CHÍNH ma trận backend, Q45) hay hộp huỷ nội tuyến khi đã mở.
// Ở đây quản lý tiêu điểm khi ĐÓNG hộp: trả về nút mở; nếu nút không còn (lịch vừa đổi trạng thái, `choPhepHuy` thành `false`) thì về tiêu đề trang, để tiêu điểm không
// rơi về `body`. Huỷ xong thì hộp ở lại hiện kết quả (không có việc đóng), tiêu điểm đã vào vùng kết quả (`CancelBox`).
interface CancelSectionProps {
  detail: PatientAppointmentDetail;
  box: CancelBoxController;
  onReload: () => void;
  fallbackFocusRef: RefObject<HTMLElement | null>;
}

export function CancelSection({
  detail,
  box,
  onReload,
  fallbackFocusRef,
}: CancelSectionProps) {
  const openRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const closed = box.state.kind === 'closed';

  useEffect(() => {
    if (!closed || !restoreFocus.current) return;
    restoreFocus.current = false;
    (openRef.current ?? fallbackFocusRef.current)?.focus();
  }, [closed, fallbackFocusRef]);

  function dismiss() {
    restoreFocus.current = true;
    box.dismiss();
  }

  if (box.state.kind === 'closed') {
    if (!detail.choPhepHuy) return null;
    return (
      <button
        ref={openRef}
        type="button"
        onClick={box.open}
        className="min-h-11 w-full rounded-xl border border-danger-line bg-white px-5 text-sm font-medium text-danger-strong hover:bg-danger-soft"
      >
        {DETAIL_TEXT.cancelButton}
      </button>
    );
  }

  // "Cọc đã thanh toán" lấy từ `thanhToan.daThu` của chi tiết (xem trước không trả số này); `null` hay 0 ⇒ "Chưa có cọc"
  const depositLabel =
    detail.thanhToan === null || isZeroAmount(detail.thanhToan.daThu)
      ? CANCEL_TEXT.noDeposit
      : formatVnd(detail.thanhToan.daThu);

  return (
    <CancelBox
      state={box.state}
      depositLabel={depositLabel}
      onDismiss={dismiss}
      onConfirm={() => void box.confirm()}
      onRetryPreview={box.retryPreview}
      onReload={onReload}
    />
  );
}
