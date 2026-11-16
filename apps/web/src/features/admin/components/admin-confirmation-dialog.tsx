import { useId, useRef, type ReactNode } from 'react';
import { useAdminDialogFocus } from '../hooks/use-admin-dialog-focus';
import styles from './admin-components.module.css';

interface AdminConfirmationDialogProps {
  open: boolean;
  title: string;
  // ReactNode để in đậm tên đối tượng (popup Ngừng hoạt động chuyên khoa, Figma 733:2)
  message: ReactNode;
  // Khối ghi chú nền cam nhạt dưới nội dung; được đọc cùng mô tả của hộp thoại
  note?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  tone?: 'primary' | 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRM_TONE_CLASS = {
  primary: '',
  danger: styles.dangerAction,
  warning: styles.warningAction,
} as const;

export function AdminConfirmationDialog({
  open,
  title,
  message,
  note,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Huỷ',
  pending = false,
  tone = 'primary',
  onConfirm,
  onCancel,
}: AdminConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();
  const noteId = useId();
  useAdminDialogFocus(open, dialogRef, onCancel);

  if (!open) return null;

  return (
    <div className={styles.dialogOverlay}>
      <section
        ref={dialogRef}
        className={`${styles.confirmationDialog} ${tone === 'warning' ? styles.warningDialog : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={note ? `${messageId} ${noteId}` : messageId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={messageId}>{message}</p>
        {note && (
          <div id={noteId} role="note" className={styles.dialogNote}>
            <img src="/assets/admin/note-warning.svg" alt="" />
            <span>{note}</span>
          </div>
        )}
        <div className={styles.dialogActions}>
          <button type="button" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.primaryAction} ${CONFIRM_TONE_CLASS[tone]}`}
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
