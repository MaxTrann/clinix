import { Link } from 'react-router';
import type { RoleShellNotifications } from '../../../shared/ui/role-shell';
import { unreadBadgeText, unreadLabel } from '../../../shared/ui/unread-badge';
import styles from './admin-layout.module.css';

interface AdminHeaderProps {
  onLogout: () => void;
  logoutPending: boolean;
  // notification F3: số chưa đọc do router thăm dò rồi truyền xuống (module admin không import `features/notification`, WTB-16).
  // Không truyền ⇒ nút chuông vô hiệu như admin F1.
  notifications?: RoleShellNotifications;
}

export function AdminHeader({
  onLogout,
  logoutPending,
  notifications,
}: AdminHeaderProps) {
  const badge = notifications ? unreadBadgeText(notifications.unread) : null;
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarSpacer} />
      {notifications ? (
        // Q14: chuông là LIÊN KẾT tới trang Thông báo; tên truy cập kèm số, số hiển thị ẩn với trình đọc màn hình (WTB-15)
        <Link
          className={styles.notificationButton}
          to={notifications.to}
          aria-label={unreadLabel(notifications.unread)}
          title="Thông báo"
        >
          <img src="/assets/admin/header-notification.svg" alt="" />
          {badge !== null && (
            <span aria-hidden="true" className={styles.notificationBadge}>
              {badge}
            </span>
          )}
        </Link>
      ) : (
        <button
          className={styles.notificationButton}
          type="button"
          disabled
          aria-label="Thông báo"
          title="Thông báo"
        >
          <img src="/assets/admin/header-notification.svg" alt="" />
        </button>
      )}
      <button
        className={styles.headerLogout}
        type="button"
        disabled={logoutPending}
        onClick={onLogout}
      >
        <img src="/assets/admin/header-logout.svg" alt="" />
        <span>Đăng xuất</span>
      </button>
      {notifications && (
        // Vùng đọc khi số chưa đọc tăng (WTB-03 ở khung Admin)
        <p aria-live="polite" className="sr-only">
          {notifications.announce ? 'Bạn có thông báo mới' : ''}
        </p>
      )}
    </header>
  );
}
