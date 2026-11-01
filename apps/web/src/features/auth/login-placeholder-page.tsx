import { Navigate } from 'react-router';
import { LoadingState } from '../../shared/ui/loading-state';
import { useAuth } from './auth-store';
import { homePathFor } from './roles';

// Chỗ giữ cho màn đăng nhập của F3. F3 thay file này, giữ lại phần chuyển hướng và dòng thông báo phiên.
export function LoginPlaceholderPage() {
  const { status, user, sessionEnded } = useAuth();

  if (status === 'checking') return <LoadingState />;
  if (user) return <Navigate to={homePathFor(user.vaiTro)} replace />;

  return (
    <main>
      <h1>Đăng nhập</h1>
      {sessionEnded && (
        <p role="status">
          Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.
        </p>
      )}
    </main>
  );
}
