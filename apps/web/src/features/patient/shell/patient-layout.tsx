import { Outlet } from 'react-router';
import { RoleShell, type RoleNavItem } from '../../../shared/ui/role-shell';
import {
  LOGOUT_FAILED_MESSAGE,
  ROLE_LABELS,
  useAuth,
  useLogout,
} from '../../auth';

export interface PatientLayoutProps {
  // Cấu hình menu do lớp router giữ (router/role-nav.ts, Q21d): module khác thêm `to` ở đó, không sửa file này
  items: RoleNavItem[];
  footerItems?: RoleNavItem[];
}

export function PatientLayout({ items, footerItems }: PatientLayoutProps) {
  const { user } = useAuth();
  // MỘT hook cho cả hai nút Đăng xuất: dùng chung `pending`/`failed`, bấm cả hai vẫn một request
  const { run, pending, failed } = useLogout();

  // Cổng RequireAuth chỉ render khung khi đã đăng nhập; dòng này chỉ để kiểu không còn null
  if (!user) return null;

  return (
    <RoleShell
      navLabel="Điều hướng Bệnh nhân"
      userName={user.hoTen}
      userSubtitle={ROLE_LABELS.BenhNhan}
      items={items}
      footerItems={footerItems}
      logout={{
        onLogout: () => void run(),
        pending,
        failed,
        failedMessage: LOGOUT_FAILED_MESSAGE,
      }}
    >
      <Outlet />
    </RoleShell>
  );
}
