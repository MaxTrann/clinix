import { Outlet } from 'react-router';
import { BookingDraftProvider } from './booking-draft-provider';

// Route cha của Bước 4–6: giữ context bộ nhớ (Q38) sống khi chuyển giữa các bước và gỡ nó khi rời wizard.
// Chưa đăng nhập hay sai vai trò thì cổng `RequireAuth` ở `router/routes.tsx` chặn TRƯỚC khi tới đây.
export function BookingWizardLayout() {
  return (
    <BookingDraftProvider>
      <Outlet />
    </BookingDraftProvider>
  );
}
