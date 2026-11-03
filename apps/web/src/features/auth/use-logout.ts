import { useCallback, useState } from 'react';
import { logout } from './auth-session';
import { usePageActive } from './use-page-active';

// Câu của G5; giao diện của câu và nút thử lại do từng khung quyết định
export const LOGOUT_FAILED_MESSAGE = 'Không đăng xuất được, vui lòng thử lại';

// Nút Đăng xuất của mọi khung (Admin, Bệnh nhân, Lễ tân, Bác sĩ, trang giữ chỗ): đăng xuất ngay, không hộp xác nhận (G5).
// Thành công thì cổng tự chuyển về đăng nhập và gỡ trang, nơi gọi không cần điều hướng. `run` không bao giờ ném lỗi.
export function useLogout() {
  const active = usePageActive();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = useCallback(async () => {
    setPending(true);
    setFailed(false);
    try {
      // `logout()` single-flight: bấm nhiều lần vẫn chỉ một request
      await logout();
    } catch {
      // 403, 5xx, mất mạng, timeout: vẫn đăng nhập, cho thử lại
      if (active.current) setFailed(true);
    } finally {
      if (active.current) setPending(false);
    }
  }, [active]);

  return { run, pending, failed };
}
