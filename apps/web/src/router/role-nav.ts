import {
  Calendar,
  ClipboardList,
  House,
  LayoutDashboard,
  ListOrdered,
  Bell,
  MessageCircle,
  Users,
  Wallet,
} from 'lucide-react';
import { PATIENT_PATHS } from '../features/patient';
import type { RoleNavItem } from '../shared/ui/role-shell';

// Menu của các khung theo vai trò (Q21d). Module có trang mới chỉ thêm `to` cho mục của mình ở đây và ghép route ở role-routes.tsx;
// mục chưa có `to` hiện là nút vô hiệu. Thứ tự và biểu tượng theo Figma `416:2` (đã đối chiếu đường SVG với lucide-react).
export const PATIENT_NAV: { items: RoleNavItem[]; footerItems: RoleNavItem[] } =
  {
    items: [
      { label: 'Tổng quan', icon: LayoutDashboard },
      { label: 'Lịch hẹn của tôi', icon: Calendar },
      { label: 'Hồ sơ khám bệnh', icon: ClipboardList },
      { label: 'Ví của tôi', icon: Wallet },
      { label: 'Danh sách chờ', icon: ListOrdered },
      { label: 'Tin nhắn', icon: MessageCircle },
      { label: 'Thông báo', icon: Bell },
      { label: 'Hồ sơ người khám', icon: Users, to: PATIENT_PATHS.profile },
    ],
    // `to: '/'` chỉ sáng ở đúng `/` (NavLink coi gốc là khớp đúng), không cần `end`
    footerItems: [{ label: 'Về trang chủ', icon: House, to: '/' }],
  };
