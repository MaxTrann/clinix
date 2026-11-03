import { ArrowRight } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router';
import { AuthCard } from '../../../shared/ui/auth-card';
import { LoadingState } from '../../../shared/ui/loading-state';
import { PRIMARY_LINK, SuccessPanel } from '../auth-form-parts';
import { useAuth } from '../auth-store';
import { textFrom } from '../route-state';
import { LOGIN_PATH, REGISTER_PATH, homePathFor } from '../roles';
import { VerifyForm } from './verify-form';
import { parseVerifyState } from './verify-state';

// Frame `649:2`. Xác minh xong KHÔNG có phiên (ĐK b10): người dùng phải đăng nhập.
function VerifySuccess({ email }: { email: string }) {
  return (
    <AuthCard
      title="Xác minh thành công"
      subtitle="Tài khoản của bạn đã sẵn sàng"
    >
      <SuccessPanel heading="Email đã được xác minh!">
        <p className="mb-6 text-sm text-gray-500">
          Email đã xác minh. Đăng nhập bằng email và mật khẩu đã chọn để đặt
          lịch.
        </p>
        <Link to={LOGIN_PATH} state={{ email }} className={PRIMARY_LINK}>
          Đăng nhập
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </SuccessPanel>
    </AuthCard>
  );
}

export function VerifyEmailPage() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <LoadingState />;
  if (user) return <Navigate to={homePathFor(user.vaiTro)} replace />;

  const state = parseVerifyState(location.state);
  if (state === null) {
    const email = textFrom(location.state, 'email');
    return (
      <Navigate
        to={REGISTER_PATH}
        replace
        state={email === null ? undefined : { email }}
      />
    );
  }
  if ('verified' in state) return <VerifySuccess email={state.email} />;

  return (
    <AuthCard
      title="Xác minh email"
      subtitle={`Nhập mã 6 chữ số được gửi đến ${state.email}`}
    >
      <VerifyForm initial={state} />
    </AuthCard>
  );
}
