import { Outlet } from 'react-router';
import { RoleShell, type RoleNavItem } from '../../../shared/ui/role-shell';
import {
  LOGOUT_FAILED_MESSAGE,
  ROLE_LABELS,
  useAuth,
  useLogout,
} from '../../auth';

export interface DoctorLayoutProps {
  // Cấu hình menu do lớp router giữ (router/role-nav.ts): module khác thêm `to` ở đó, không sửa file này
  items: RoleNavItem[];
}

// Khung Bác sĩ (doctor F1, Figma `466:2`). Tự nối RoleShell, không dùng RoleLayout của `features/patient` (không xuất ra ngoài module, Q35).
// Figma Bác sĩ không có "Về trang chủ" nên không có `footerItems`; chuông thông báo và số đếm ẩn tới khi có module `notification` (TECH_DEBT 62).
export function DoctorLayout({ items }: DoctorLayoutProps) {
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
