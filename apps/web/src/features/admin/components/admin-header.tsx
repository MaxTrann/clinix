import styles from './admin-layout.module.css';

interface AdminHeaderProps {
  onLogout: () => void;
  logoutPending: boolean;
}

export function AdminHeader({ onLogout, logoutPending }: AdminHeaderProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarSpacer} />
      <button
        className={styles.notificationButton}
        type="button"
        disabled
        aria-label="Thông báo"
        title="Thông báo"
      >
        <img src="/assets/admin/header-notification.svg" alt="" />
      </button>
      <button
        className={styles.headerLogout}
        type="button"
        disabled={logoutPending}
        onClick={onLogout}
      >
        <img src="/assets/admin/header-logout.svg" alt="" />
        <span>Đăng xuất</span>
      </button>
    </header>
  );
}
