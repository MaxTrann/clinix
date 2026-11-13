import { useRef, useState, type RefObject } from 'react';
import { ActionDialog } from '../../common/action-dialog';
import { ReasonField } from '../../common/reason-field';
import { checkStatusReason } from '../../common/status-reason';
import { ACTION_TEXT } from './detail-messages';
import type { StatusActionState } from './use-status-action';

// Hộp "Hủy lịch hẹn" của Lễ tân (booking F9; Figma `490:2`; LTN-02): tiêu đề, `Lý do hủy *`, một ô nhiều dòng, `Đóng`, `Xác nhận hủy`. Figma KHÔNG có hoàn dự kiến (Lễ tân không có
// `cancel-preview`), bộ đếm hay câu cảnh báo, nên không thêm. `Lý do hủy` là bắt buộc 1 đến 255 đơn vị UTF-16 sau khi cắt khoảng trắng (`common/status-reason.ts`): rỗng hay quá dài thì
// CHẶN ở client, lời báo dưới ô, không gọi API, nút vẫn bật (không vô hiệu mà không giải thích). Lý do chỉ nằm trong bộ nhớ của hộp: không kho trình duyệt, URL, log.
// Ô lý do dùng chung với hộp override của Quản trị viên (`common/reason-field.tsx`, F10).
interface CancelDialogProps {
  state: StatusActionState;
  panelRef: RefObject<HTMLDivElement | null>;
  // Gửi `{ trangThai: 'DaHuy', lyDo }` (lý do đã cắt khoảng trắng và đã qua kiểm)
  onSubmit: (reason: string) => void;
  onDismiss: () => void;
  onReload: () => void;
}

export function CancelDialog({
  state,
  panelRef,
  onSubmit,
  onDismiss,
  onReload,
}: CancelDialogProps) {
  const [reason, setReason] = useState('');
  // Lời báo của kiểm tra ở client; xoá khi người dùng sửa ô
  const [clientError, setClientError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // Máy chủ từ chối lý do (400 `LY_DO_BAT_BUOC`) dù client cho qua: cùng chỗ hiện với lời báo của client
  const serverError =
    state.kind === 'failed' && state.failure.field === 'reason'
      ? state.failure.message
      : null;
  const error = clientError ?? serverError;
  const locked = state.kind === 'submitting' || state.kind === 'stopped';

  function confirm() {
    const checked = checkStatusReason(reason);
    if (!checked.ok) {
      setClientError(
        checked.error === 'required'
          ? ACTION_TEXT.cancel.reasonRequired
          : ACTION_TEXT.cancel.reasonTooLong,
      );
      fieldRef.current?.focus();
      return;
    }
    setClientError(null);
    onSubmit(checked.value);
  }

  return (
    <ActionDialog
      title={ACTION_TEXT.cancel.title}
      state={state}
      panelRef={panelRef}
      focusRef={fieldRef}
      dismissLabel={ACTION_TEXT.cancel.close}
      confirm={{
        label: ACTION_TEXT.cancel.confirm,
        busyLabel: ACTION_TEXT.cancel.confirming,
        // Nền `danger-strong` (red-700) chữ trắng 6,42:1 (ADR 0004); không chép `#fb2c36` của Figma (3,81:1)
        className: 'bg-danger-strong hover:bg-red-800',
      }}
      onConfirm={confirm}
      onDismiss={onDismiss}
      onReload={onReload}
    >
      <ReasonField
        label={ACTION_TEXT.cancel.reasonLabel}
        value={reason}
        onChange={(value) => {
          setReason(value);
          setClientError(null);
        }}
        error={error}
        locked={locked}
        fieldRef={fieldRef}
      />
    </ActionDialog>
  );
}
