import type { RefObject } from 'react';
import { ActionDialog } from './action-dialog';
import { ACTION_TEXT } from './detail-messages';
import type { StatusActionState } from './use-status-action';

// Hộp "Đánh dấu vắng mặt" của Lễ tân (booking F9; Figma `489:2`; LTN-03): tiêu đề, câu "Bệnh nhân **{tên}** sẽ được ghi nhận vắng mặt. Thao tác này không thể hoàn tác.", `Hủy`,
// `Xác nhận`. Gửi đúng `{ trangThai: 'VangMat' }`, KHÔNG có lý do (Q27: Vắng mặt của Lễ tân không có lý do) và không hiện số no-show hay cờ khoá (Figma không có, backend không trả).
// Tiêu điểm đầu tiên vào `Hủy` (nút an toàn, như `Giữ lịch` của F2). Tên là `nguoiKham.hoTen` (người được khám, như cột `Bệnh nhân` của danh sách), đã chụp lúc mở hộp.
interface NoShowDialogProps {
  patientName: string;
  state: StatusActionState;
  panelRef: RefObject<HTMLDivElement | null>;
  onSubmit: () => void;
  onDismiss: () => void;
  onReload: () => void;
}

export function NoShowDialog({
  patientName,
  state,
  panelRef,
  onSubmit,
  onDismiss,
  onReload,
}: NoShowDialogProps) {
  return (
    <ActionDialog
      title={ACTION_TEXT.noShow.title}
      state={state}
      panelRef={panelRef}
      dismissLabel={ACTION_TEXT.noShow.keep}
      confirm={{
        label: ACTION_TEXT.noShow.confirm,
        busyLabel: ACTION_TEXT.noShow.confirming,
        // Nền `warning` (amber-700) chữ trắng 5,05:1 (ADR 0004); không chép `#fe9a00` của Figma (2,13:1)
        className: 'bg-warning hover:bg-amber-800',
      }}
      onConfirm={onSubmit}
      onDismiss={onDismiss}
      onReload={onReload}
    >
      <p className="pt-2 text-sm text-gray-600">
        {ACTION_TEXT.noShow.patientPrefix}
        <span className="font-semibold">{patientName}</span>
        {ACTION_TEXT.noShow.willBeMarked}
      </p>
    </ActionDialog>
  );
}
