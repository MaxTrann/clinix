import { useId, useRef, type ReactNode } from 'react';
import { useAdminDialogFocus } from '../hooks/use-admin-dialog-focus';
import styles from './admin-components.module.css';

interface AdminDetailPanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function AdminDetailPanel({
  open,
  title,
  onClose,
  children,
}: AdminDetailPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useAdminDialogFocus(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div className={styles.panelOverlay}>
      <aside
        ref={panelRef}
        className={styles.detailPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.panelHeader}>
          <h2 id={titleId}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng chi tiết">
            Đóng
          </button>
        </header>
        <div className={styles.panelContent}>{children}</div>
      </aside>
    </div>
  );
}
