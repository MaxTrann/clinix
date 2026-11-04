import type { RoleNavItem } from '../../../shared/ui/role-shell';
import { RoleLayout } from './role-layout';

export interface PatientLayoutProps {
  // Cấu hình menu do lớp router giữ (router/role-nav.ts, Q21d): module khác thêm `to` ở đó, không sửa file này
  items: RoleNavItem[];
  footerItems?: RoleNavItem[];
}

// Khung Bệnh nhân (patient F1). Phần nối người dùng và đăng xuất nằm ở RoleLayout, dùng chung với khung Lễ tân (F2).
export function PatientLayout({ items, footerItems }: PatientLayoutProps) {
  return (
    <RoleLayout
      vaiTro="BenhNhan"
      navLabel="Điều hướng Bệnh nhân"
      items={items}
      footerItems={footerItems}
    />
  );
}
