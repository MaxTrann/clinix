import { Outlet } from 'react-router';
import { RoleShell, type RoleNavItem } from '../../../shared/ui/role-shell';
import {
  LOGOUT_FAILED_MESSAGE,
  ROLE_LABELS,
  useAuth,
  useLogout,
  type VaiTro,
} from '../../auth';

// Phần chung của khung Bệnh nhân và khung Lễ tân (patient F2): nối người dùng và đăng xuất vào RoleShell.
// Chỉ dùng trong module (không xuất qua index.ts); bên ngoài dùng PatientLayout, ReceptionLayout.
export interface RoleLayoutProps {
  vaiTro: VaiTro;
  // Tên truy cập của thanh bên, ví dụ "Điều hướng Bệnh nhân"
  navLabel: string;
  items: RoleNavItem[];
  footerItems?: RoleNavItem[];
}

export function RoleLayout({
  vaiTro,
  navLabel,
  items,
  footerItems,
}: RoleLayoutProps) {
  const { user } = useAuth();
  // MỘT hook cho cả hai nút Đăng xuất: dùng chung `pending`/`failed`, bấm cả hai vẫn một request
  const { run, pending, failed } = useLogout();

  // Cổng RequireAuth chỉ render khung khi đã đăng nhập; dòng này chỉ để kiểu không còn null
  if (!user) return null;

  return (
    <RoleShell
      navLabel={navLabel}
      userName={user.hoTen}
      userSubtitle={ROLE_LABELS[vaiTro]}
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
