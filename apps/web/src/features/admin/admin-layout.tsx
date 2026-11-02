import { useState } from 'react';
import { Outlet } from 'react-router';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { ApiError } from '../../shared/api/errors';
import { logout } from '../auth';
import { AdminForbiddenPage } from './admin-forbidden-page';
import { AdminMeProvider } from './admin-me-context';
import { useAdminMe } from './hooks/use-admin-me';
import { AdminHeader } from './components/admin-header';
import { AdminSidebar } from './components/admin-sidebar';
import styles from './components/admin-layout.module.css';

export function AdminLayout() {
  const { state, retry } = useAdminMe();
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  async function handleLogout() {
    setLogoutPending(true);
    setLogoutFailed(false);
    try {
      await logout();
    } catch {
      setLogoutFailed(true);
    } finally {
      setLogoutPending(false);
    }
  }

  if (state.status === 'loading') {
    return <LoadingState message="Đang tải phạm vi quản trị…" />;
  }

  if (state.status === 'error') {
    if (state.error instanceof ApiError && state.error.status === 403) {
      return <AdminForbiddenPage />;
    }
    return <ErrorState error={state.error} onRetry={retry} />;
  }

  return (
    <AdminMeProvider value={state.value}>
      <div className={styles.appShell}>
        <AdminSidebar
          adminMe={state.value}
          onLogout={() => void handleLogout()}
          logoutPending={logoutPending}
          logoutFailed={logoutFailed}
        />
        <div className={styles.mainColumn}>
          <AdminHeader
            onLogout={() => void handleLogout()}
            logoutPending={logoutPending}
          />
          <main className={styles.mainContent} aria-label="Khu vực Admin">
            <div className={styles.shellContent}>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AdminMeProvider>
  );
}
