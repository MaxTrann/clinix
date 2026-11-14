import { useRef, useState, type RefObject } from 'react';
import { useModalDialog } from '../../../../../shared/hooks/use-modal-dialog';
import { ActionDialog } from '../../common/action-dialog';
import { COMMON_ACTION_TEXT } from '../../common/action-text';
import { appointmentStateLabel } from '../../common/appointment-status';
import { ReasonField } from '../../common/reason-field';
import { checkStatusReason } from '../../common/status-reason';
import type { StatusActionState } from '../../common/use-status-action';
import type {
  OverrideResult,
  OverrideTarget,
} from '../api/admin-appointment-types';
import { OVERRIDE_TEXT, transitionSentence } from './detail-messages';

// Nền nút xác nhận theo đích, token ADR 0004: `Hủy` nền `danger-strong` (6,42:1), `Vắng mặt` nền `warning` (5,05:1), hai đích còn lại nền `brand-strong` (5,28:1)
const CONFIRM_CLASS: Record<OverrideTarget, string> = {
  DaHuy: 'bg-danger-strong hover:bg-red-800',
  VangMat: 'bg-warning hover:bg-amber-800',
  DaTiepDon: 'bg-brand-strong hover:bg-cyan-800',
  DaXacNhan: 'bg-brand-strong hover:bg-cyan-800',
};

// Hộp "Đổi trạng thái lịch hẹn" của Quản trị viên (booking F10; QT-03; Figma CHƯA có frame: dựng theo hộp Hủy `490:2` và hộp Vắng mặt `489:2` của Lễ tân cộng ô lý do bắt buộc, nhóm bổ sung Figma).
// MỘT hộp cho cả bốn đích (`Đã tiếp đón`, `Đã xác nhận`, `Vắng mặt`, `Hủy`): câu "Lịch hẹn {mã} sẽ chuyển từ {Từ} sang {Đến}.", cảnh báo riêng của đích, `Lý do *` BẮT BUỘC ở mọi đích (1 đến 255
// đơn vị UTF-16 sau `trim()`: rỗng hay quá dài thì CHẶN ở client, lời báo dưới ô, không gọi API, nút vẫn bật). Lý do chỉ nằm trong bộ nhớ của hộp: không kho trình duyệt, URL, log.
// Đây là modal DUY NHẤT của trang (chi tiết là trang, không phải ngăn) nên hộp gọi MỘT `useModalDialog` (Esc, bẫy Tab, khoá cuộn); khung `ActionDialog` của `common/` không gọi hook. Tiêu điểm trả
// về nút đã mở do `use-override.ts` làm SAU khi hộp gỡ (nền `inert` được gỡ trước): hook nhận một ref rỗng nên không tự trả tiêu điểm (lúc đó nền còn `inert`, `focus()` không có tác dụng).
interface OverrideDialogProps {
  maLichHen: string;
  target: OverrideTarget;
  // Trạng thái hiện tại, chụp lúc mở (chi tiết có thể đang tải lại khi hộp còn hiện)
  fromState: string;
  state: StatusActionState<OverrideResult>;
  panelRef: RefObject<HTMLDivElement | null>;
  // Gửi `{ trangThai, lyDo }` (lý do đã cắt khoảng trắng và đã qua kiểm)
  onSubmit: (reason: string) => void;
  onDismiss: () => void;
  onReload: () => void;
}

export function OverrideDialog({
  maLichHen,
  target,
  fromState,
  state,
  panelRef,
  onSubmit,
  onDismiss,
  onReload,
}: OverrideDialogProps) {
  const [reason, setReason] = useState('');
  // Lời báo của kiểm tra ở client; xoá khi người dùng sửa ô
  const [clientError, setClientError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Ref rỗng: hook không trả tiêu điểm (xem chú thích đầu file)
  const noReturnFocusRef = useRef<HTMLElement | null>(null);
  useModalDialog({
    open: true,
    dialogRef: panelRef,
    initialFocusRef: fieldRef,
    returnFocusRef: noReturnFocusRef,
    onClose: onDismiss,
  });

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
          ? COMMON_ACTION_TEXT.reasonRequired
          : OVERRIDE_TEXT.dialog.reasonTooLong,
      );
      fieldRef.current?.focus();
      return;
    }
    setClientError(null);
    onSubmit(checked.value);
  }

  return (
    <ActionDialog
      title={OVERRIDE_TEXT.dialog.title}
      state={state}
      panelRef={panelRef}
      focusRef={fieldRef}
      dismissLabel={OVERRIDE_TEXT.dialog.close}
      confirm={{
        label: OVERRIDE_TEXT.dialog.confirm,
        busyLabel: OVERRIDE_TEXT.dialog.confirming,
        className: CONFIRM_CLASS[target],
      }}
      onConfirm={confirm}
      onDismiss={onDismiss}
      onReload={onReload}
    >
      <p className="pt-2 text-sm text-gray-600">
        {transitionSentence(
          maLichHen,
          appointmentStateLabel(fromState),
          appointmentStateLabel(target),
        )}
      </p>
      <p className="pt-2 text-xs text-gray-700">
        {OVERRIDE_TEXT.warnings[target]}
      </p>
      <ReasonField
        label={OVERRIDE_TEXT.dialog.reasonLabel}
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
