import {
  Calendar,
  ClipboardList,
  House,
  LayoutDashboard,
  ListOrdered,
  Bell,
  MessageCircle,
  RefreshCw,
  Stethoscope,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { PATIENT_PATHS, RECEPTION_PATHS } from '../features/patient';
import type { RoleNavItem } from '../shared/ui/role-shell';

// Menu của các khung theo vai trò (Q21d). Module có trang mới chỉ thêm `to` cho mục của mình ở đây và ghép route ở role-routes.tsx;
// mục chưa có `to` hiện là nút vô hiệu. Thứ tự và tên biểu tượng theo Figma `416:2` (Bệnh nhân), `483:2` (Lễ tân); hình khớp lucide-react
// trừ Calendar, ListOrdered, MessageCircle lệch nhẹ (Figma dùng bản vẽ cũ của lucide), xem docs/features/patient/TRACKING.md F2-B.
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

// patient F2. Không có `footerItems` (Figma Lễ tân không có "Về trang chủ"). "Tra cứu bệnh nhân" không đặt `end`: trang con của F8 vẫn sáng mục này.
// "Thông tin cá nhân" có trang từ patient F4 (không đặt `end`: trang không có trang con); "Lịch làm việc bác sĩ" do `doctor`, "Quản lý lịch hẹn", "Yêu cầu đổi lịch", "Danh sách chờ" do `booking`.
export const RECEPTION_NAV: { items: RoleNavItem[] } = {
  items: [
    { label: 'Tổng quan', icon: LayoutDashboard },
    { label: 'Quản lý lịch hẹn', icon: Calendar },
    { label: 'Tra cứu bệnh nhân', icon: Users, to: RECEPTION_PATHS.lookup },
    { label: 'Lịch làm việc bác sĩ', icon: Stethoscope },
    { label: 'Yêu cầu đổi lịch', icon: RefreshCw },
    { label: 'Danh sách chờ', icon: ListOrdered },
    { label: 'Tin nhắn', icon: MessageCircle },
    { label: 'Thông báo', icon: Bell },
    { label: 'Thông tin cá nhân', icon: User, to: RECEPTION_PATHS.profile },
  ],
};
