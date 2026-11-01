import { Navigate } from 'react-router';
import { AuthCard } from '../../../shared/ui/auth-card';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { retrySession } from '../auth-session';
import { useAuth } from '../auth-store';
import { homePathFor } from '../roles';
import { LoginForm } from './login-form';

// Đăng nhập xong không tự điều hướng: `user` có giá trị thì nhánh dưới chuyển hướng, nên chỉ có một đường đi (F1-D).
export function LoginPage() {
  const { status, user, sessionEnded, error, canRetry } = useAuth();

  if (status === 'checking') return <LoadingState />;
  if (user) return <Navigate to={homePathFor(user.vaiTro)} replace />;

  // Lỗi ở /auth/me thì phiên đã tạo: ẩn biểu mẫu để không thể gọi lại login(), chỉ cho retrySession()
  if (status === 'error' && canRetry) {
    return (
      <AuthCard title="Đăng nhập" subtitle="Chào mừng bạn trở lại CLINIX">
        <ErrorState error={error} onRetry={() => void retrySession()} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Đăng nhập" subtitle="Chào mừng bạn trở lại CLINIX">
      {status === 'error' && <ErrorState error={error} />}
      <LoginForm sessionEnded={sessionEnded} />
    </AuthCard>
  );
}
