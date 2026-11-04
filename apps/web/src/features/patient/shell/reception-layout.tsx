import type { RoleNavItem } from '../../../shared/ui/role-shell';
import { RoleLayout } from './role-layout';

export interface ReceptionLayoutProps {
  // Cấu hình menu do lớp router giữ (router/role-nav.ts, Q21d)
  items: RoleNavItem[];
}

// Khung Lễ tân (patient F2, Figma `483:2`). Không nhận `footerItems`: Figma Lễ tân không có "Về trang chủ", cuối thanh bên chỉ có nút Đăng xuất.
export function ReceptionLayout({ items }: ReceptionLayoutProps) {
  return (
    <RoleLayout vaiTro="LeTan" navLabel="Điều hướng Lễ tân" items={items} />
  );
}
