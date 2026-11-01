import { useId, useRef } from 'react';
import { useAdminDialogFocus } from '../hooks/use-admin-dialog-focus';
import styles from './admin-components.module.css';

interface AdminConfirmationDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AdminConfirmationDialog({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Huỷ',
  pending = false,
  onConfirm,
  onCancel,
}: AdminConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();
  useAdminDialogFocus(open, dialogRef, onCancel);

  if (!open) return null;

  return (
    <div className={styles.dialogOverlay}>
      <section
        ref={dialogRef}
        className={styles.confirmationDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={messageId}>{message}</p>
        <div className={styles.dialogActions}>
          <button type="button" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.primaryAction}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
