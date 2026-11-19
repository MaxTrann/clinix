import type { ReactNode } from 'react';
import { AdminConfirmationDialog } from '../components/admin-confirmation-dialog';
import type { AccountRole } from './account-types';

// Hộp xác nhận KHOÁ tài khoản (PLAN TK b7, Figma 534:2 chỉ là bản phác thảo). Dùng chung với F8: F8 truyền `note` riêng cho từng loại
// (ví dụ Bác sĩ còn lịch hẹn đang phụ thuộc). Chưa gọi API tới khi bấm xác nhận; mở khoá thì KHÔNG cần hộp (như "Kích hoạt" chuyên khoa của F2).
// Chữ là `[đề xuất]` (TRACKING admin 9A.12 mục 2.4), nhóm duyệt sau. Họ tên là chữ tự do: chỉ in như văn bản thường.

interface AccountLockDialogProps {
  open: boolean;
  hoTen: string;
  role: AccountRole;
  pending: boolean;
  /** Ghi chú riêng của loại tài khoản; bỏ trống thì dùng ghi chú mặc định của Bệnh nhân (hoặc không có). */
  note?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

const PATIENT_NOTE = 'Lịch hẹn đã đặt không bị huỷ hay thay đổi.';

export function AccountLockDialog({
  open,
  hoTen,
  role,
  pending,
  note,
  onConfirm,
  onCancel,
}: AccountLockDialogProps) {
  const isPatient = role === 'BenhNhan';
  return (
    <AdminConfirmationDialog
      open={open}
      title={isPatient ? 'Khoá tài khoản bệnh nhân?' : 'Khoá tài khoản?'}
      message={
        <>
          Tài khoản <strong>{hoTen}</strong> sẽ bị khoá và đăng xuất khỏi mọi
          thiết bị ngay.{' '}
          {isPatient
            ? 'Bệnh nhân không đăng nhập hay đặt lịch được cho đến khi được mở khoá.'
            : 'Người dùng không đăng nhập được cho đến khi được mở khoá.'}
        </>
      }
      note={note ?? (isPatient ? PATIENT_NOTE : undefined)}
      confirmLabel="Khoá tài khoản"
      cancelLabel="Huỷ"
      pending={pending}
      tone="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
