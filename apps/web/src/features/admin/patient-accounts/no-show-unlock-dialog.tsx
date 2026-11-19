import { useRemote } from '../../../shared/hooks/use-remote';
import { formatNoShowCount } from '../account-common/account-format';
import { relockOutlook } from '../account-common/account-rules';
import { AdminConfirmationDialog } from '../components/admin-confirmation-dialog';
import { getNoShowThreshold } from './no-show-threshold';

// Hộp "Mở khoá no-show" (Q31): báo rõ số lần no-show được GIỮ NGUYÊN nên no-show kế tiếp có thể khoá đặt lịch lại ngay.
// Chỉ được dựng khi hộp mở (Toàn hệ thống), nên mỗi lần mở là một lần đọc ngưỡng mới. Câu chung luôn có; câu cụ thể chỉ thêm khi BIẾT ngưỡng.
// Ngưỡng chưa có (đang tải, lỗi, chưa cấu hình, 403) thì chỉ còn câu chung, không có con số nào. Chữ cụ thể là `[đề xuất]` (TRACKING 9A.12 mục 2.5).
// Không có ô nhập số lần: muốn giảm số lần phải dùng use case điều chỉnh riêng (UC 52, ngoài phạm vi).

interface NoShowUnlockDialogProps {
  hoTen: string;
  soLanNoShow: number | null | undefined;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function NoShowUnlockDialog({
  hoTen,
  soLanNoShow,
  pending,
  onConfirm,
  onCancel,
}: NoShowUnlockDialogProps) {
  const { state } = useRemote((signal) => getNoShowThreshold(signal), []);
  const outlook = relockOutlook(
    soLanNoShow,
    state.status === 'ready' ? state.data : null,
  );
  const note =
    outlook.kind === 'relock'
      ? `Ngưỡng hiện tại là ${outlook.nguong} lần: chỉ cần thêm một lần no-show, đặt lịch sẽ bị khoá lại ngay.`
      : outlook.kind === 'below'
        ? `Ngưỡng hiện tại là ${outlook.nguong} lần, cao hơn số lần no-show hiện tại.`
        : undefined;

  return (
    <AdminConfirmationDialog
      open
      title="Mở khoá no-show?"
      message={
        <>
          Bệnh nhân <strong>{hoTen}</strong> sẽ được đặt lịch trở lại. Số lần
          no-show hiện tại ({formatNoShowCount(soLanNoShow)}) được giữ nguyên.
          No-show kế tiếp có thể khoá đặt lịch lại ngay nếu số lần còn ≥ ngưỡng.
        </>
      }
      note={note}
      confirmLabel="Mở khoá no-show"
      cancelLabel="Huỷ"
      pending={pending}
      tone="warning"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
