import { ArrowRight, CircleCheck } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router';
import { AuthCard } from '../../../shared/ui/auth-card';
import { LoadingState } from '../../../shared/ui/loading-state';
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
      <div className="py-4 text-center">
        <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-green-100">
          <CircleCheck className="size-8 text-success" aria-hidden="true" />
        </span>
        <p className="mb-2 font-medium text-gray-700">
          Email đã được xác minh!
        </p>
        <p className="mb-6 text-sm text-gray-500">
          Email đã xác minh. Đăng nhập bằng email và mật khẩu đã chọn để đặt
          lịch.
        </p>
        <Link
          to={LOGIN_PATH}
          state={{ email }}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-strong px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-cyan-800"
        >
          Đăng nhập
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
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
