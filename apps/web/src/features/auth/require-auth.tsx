import { Navigate, useLocation } from 'react-router';
import { NotFoundPage } from '../../pages/not-found-page';
import { AccessGate, type AccessDecision } from '../../router/access-gate';
import { ErrorState } from '../../shared/ui/error-state';
import { retrySession } from './auth-session';
import { useAuth, type AuthState } from './auth-store';
import { returnToStateFor } from './return-to';
import { LOGIN_PATH, type VaiTro } from './roles';

interface RequireAuthProps {
  // Bỏ trống = mọi vai trò đã đăng nhập
  roles?: VaiTro[];
}

function decide(state: AuthState, roles?: VaiTro[]): AccessDecision {
  if (state.status === 'checking') return 'checking';
  if (state.status !== 'authenticated' || !state.user) return 'denied';
  return !roles || roles.includes(state.user.vaiTro) ? 'allowed' : 'denied';
}

// Cổng thật của F1: chỉ ẩn giao diện, quyền thật do API kiểm. Sai vai trò hiện 404 để không lộ trang có tồn tại.
export function RequireAuth({ roles }: RequireAuthProps) {
  const state = useAuth();
  const location = useLocation();

  let denied = <NotFoundPage />;
  if (state.status === 'unauthenticated') {
    // Ghi trang đang mở vào `state.from` để đăng nhập xong quay lại (booking F3, Q39); trang đăng nhập chỉ dùng khi hợp lệ và hợp vai
    denied = (
      <Navigate to={LOGIN_PATH} replace state={returnToStateFor(location)} />
    );
  } else if (state.status === 'error') {
    denied = (
      <ErrorState
        error={state.error}
        onRetry={state.canRetry ? () => void retrySession() : undefined}
      />
    );
  }
  return <AccessGate decision={decide(state, roles)} denied={denied} />;
}
