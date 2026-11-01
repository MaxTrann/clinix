import { useState } from 'react';
import { logout } from './auth-session';
import { useAuth } from './auth-store';
import { ROLE_LABELS } from './roles';

// Trang giữ chỗ (PLAN mục 4.2), kiểu tối giản [đề xuất]; thay bằng trang thật ở router/role-routes.tsx khi module tương ứng xong.
export function RolePlaceholderPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!user) return null;

  async function handleLogout() {
    setPending(true);
    setFailed(false);
    try {
      await logout();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <main>
      <h1>{ROLE_LABELS[user.vaiTro]}</h1>
      <p>{user.hoTen}</p>
      {failed ? (
        <div role="alert">
          <p>Không đăng xuất được, vui lòng thử lại</p>
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
