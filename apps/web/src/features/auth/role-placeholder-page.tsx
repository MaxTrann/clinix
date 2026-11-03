import { useAuth } from './auth-store';
import { ROLE_LABELS } from './roles';
import { LOGOUT_FAILED_MESSAGE, useLogout } from './use-logout';

// Trang giữ chỗ (PLAN mục 4.2), kiểu tối giản [đề xuất]; thay bằng trang thật ở router/role-routes.tsx khi module tương ứng xong.
export function RolePlaceholderPage() {
  const { user } = useAuth();
  const { run: handleLogout, pending, failed } = useLogout();

  if (!user) return null;

  return (
    <main>
      <h1>{ROLE_LABELS[user.vaiTro]}</h1>
      <p>{user.hoTen}</p>
      {failed ? (
        <div role="alert">
          <p>{LOGOUT_FAILED_MESSAGE}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void handleLogout()}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => void handleLogout()}
        >
          Đăng xuất
        </button>
      )}
    </main>
  );
}
