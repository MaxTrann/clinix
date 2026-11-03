import { Navigate, useLocation } from 'react-router';
import { AuthCard } from '../../../shared/ui/auth-card';
import { LoadingState } from '../../../shared/ui/loading-state';
import { useAuth } from '../auth-store';
import { textFrom } from '../route-state';
import { homePathFor } from '../roles';
import { RegisterForm } from './register-form';

export function RegisterPage() {
  const { status, user } = useAuth();
  const { state } = useLocation();

  if (status === 'checking') return <LoadingState />;
  if (user) return <Navigate to={homePathFor(user.vaiTro)} replace />;

  return (
    <AuthCard
      title="Tạo tài khoản"
      subtitle="Đăng ký để đặt lịch khám tại CLINIX"
    >
      <RegisterForm
        prefill={{
          hoTen: textFrom(state, 'hoTen') ?? '',
          email: textFrom(state, 'email') ?? '',
          soDienThoai: textFrom(state, 'soDienThoai') ?? '',
          notice: textFrom(state, 'notice'),
        }}
      />
    </AuthCard>
  );
}
