import { screen, waitFor } from '@testing-library/react';
import type { VaiTro } from '../../auth';
import {
  resetAuthStore,
  setAccessToken,
  setAuthState,
  type AuthStatus,
} from '../../auth/auth-store';
import type { FakeArticleApi } from './fake-article-api';

// Giúp test của khối đánh giá (article F3) dựng "ai đang đăng nhập" ở CẢ HAI phía: kho phiên của web (`useAuth`) và danh tính của bản giả API
// (token đi theo request). Hai phía phải khớp, nếu không bản giả sẽ từ chối như máy chủ thật (khách 401, vai khác 403). Chỉ dùng trong test.
export function resetSession(): void {
  resetAuthStore();
  setAccessToken(null);
}

export function signIn(
  api: FakeArticleApi,
  vaiTro: VaiTro = 'BenhNhan',
  accountId = 'bn-1',
): void {
  api.signInAs(vaiTro, accountId);
  setAuthState({
    status: 'authenticated',
    user: { vaiTro, hoTen: 'Người dùng mẫu', daXacMinhEmail: true },
    error: null,
    canRetry: false,
  });
}

export function signOutAsGuest(api: FakeArticleApi): void {
  api.signOut();
  setAuthState({ status: 'unauthenticated', user: null });
}

// Phiên chưa rõ: `checking` (đang khôi phục) hay `error` (kiểm tra phiên lỗi); `user` luôn rỗng
export function setUnknownSession(
  status: Extract<AuthStatus, 'checking' | 'error'>,
) {
  setAuthState({ status, user: null });
}

// Nút theo tên đọc (số đếm nằm trong tên) và ĐÃ dùng được: chờ tới khi hết `aria-disabled` (lúc đang tải phiếu của mình nút bị khoá)
export async function findEnabledButton(
  name: string,
  pressed?: boolean,
): Promise<HTMLElement> {
  const button = await screen.findByRole('button', {
    name,
    ...(pressed === undefined ? {} : { pressed }),
  });
  await waitFor(() =>
    expect(button).not.toHaveAttribute('aria-disabled', 'true'),
  );
  return button;
}
