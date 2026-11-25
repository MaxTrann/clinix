import { Outlet } from 'react-router';
import {
  RoleShell,
  type RoleNavItem,
  type RoleShellNotifications,
} from '../../../shared/ui/role-shell';
import {
  LOGOUT_FAILED_MESSAGE,
  ROLE_LABELS,
  useAuth,
  useLogout,
} from '../../auth';

export interface DoctorLayoutProps {
  // Cấu hình menu do lớp router giữ (router/role-nav.ts): module khác thêm `to` ở đó, không sửa file này
  items: RoleNavItem[];
  // notification F1: chuông và số đếm do router thăm dò rồi truyền xuống (module này không import `features/notification`, WTB-16)
  notifications?: RoleShellNotifications;
}

// Khung Bác sĩ (doctor F1, Figma `466:2`). Tự nối RoleShell, không dùng RoleLayout của `features/patient` (không xuất ra ngoài module, Q35).
// Figma Bác sĩ không có "Về trang chủ" nên không có `footerItems`; chuông thông báo và số đếm nhận qua prop `notifications` (notification F1, TECH_DEBT 62).
export function DoctorLayout({ items, notifications }: DoctorLayoutProps) {
  const { user } = useAuth();
  // MỘT hook cho cả hai nút Đăng xuất: dùng chung `pending`/`failed`, bấm cả hai vẫn một request
  const { run, pending, failed } = useLogout();

  // Cổng RequireAuth chỉ render khung khi đã đăng nhập; dòng này chỉ để kiểu không còn null
  if (!user) return null;

  return (
    <RoleShell
      navLabel="Điều hướng Bác sĩ"
      userName={user.hoTen}
      userSubtitle={ROLE_LABELS.BacSi}
      items={items}
      notifications={notifications}
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
