import { useId, useRef, type FormEvent, type ReactNode } from 'react';
import shared from '../../components/admin-components.module.css';
import { useAdminDialogFocus } from '../../hooks/use-admin-dialog-focus';
import styles from './change-requests.module.css';

// Khung hộp thoại có ô nhập cho các thao tác trên yêu cầu thay đổi chi nhánh (admin F6b): Duyệt (Figma 546:2), Từ chối (547:2);
// PR sau dùng lại cho Rút, Hủy, Dời hiệu lực. Dùng lại overlay, khung và nút của `AdminConfirmationDialog`; Escape hay Hủy đóng hộp thoại
// (trừ lúc đang gửi), focus giữ trong hộp thoại (`useAdminDialogFocus`).

interface RequestActionDialogProps {
  title: string;
  /** Biểu tượng nhỏ trước tiêu đề như Figma 546:2 (ô tích) */
  icon?: string;
  children: ReactNode;
  /** Lỗi chặn thao tác (khối đỏ như Figma 546:2), ví dụ hệ thống chưa cấu hình, hay lỗi máy chủ trả về */
  error?: { title: string; message: string } | null;
  confirmLabel: string;
  tone: 'primary' | 'danger' | 'success';
  pending: boolean;
  /** Tắt nút xác nhận (ví dụ chưa cấu hình); vẫn đóng được */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RequestActionDialog({
  title,
  icon,
  children,
  error,
  confirmLabel,
  tone,
  pending,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: RequestActionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const errorId = useId();
  useAdminDialogFocus(true, dialogRef, () => {
    if (!pending) onCancel();
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending && !confirmDisabled) onConfirm();
  }

  const toneClass =
    tone === 'danger'
      ? shared.dangerAction
      : tone === 'success'
        ? styles.successAction
        : '';

  return (
    <div className={shared.dialogOverlay}>
      <section
        ref={dialogRef}
        className={`${shared.confirmationDialog} ${styles.actionDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        tabIndex={-1}
      >
        <h2 id={titleId} className={styles.dialogTitle}>
          {icon && <img src={icon} alt="" />}
          {title}
        </h2>
        <form noValidate onSubmit={submit}>
          {children}
          {error && (
            <div id={errorId} className={styles.dialogError} role="alert">
              <strong>{error.title}</strong>
              <span>{error.message}</span>
            </div>
          )}
          <div className={`${shared.dialogActions} ${styles.dialogButtons}`}>
            <button type="button" onClick={onCancel} disabled={pending}>
              Hủy
            </button>
            <button
              type="submit"
              className={`${shared.primaryAction} ${toneClass}`}
              disabled={pending || confirmDisabled}
            >
              {pending ? 'Đang xử lý…' : confirmLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
