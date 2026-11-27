import { AdminLayout } from '../features/admin/admin-layout';
import { useChatConnection, useChatUnreadCount } from '../features/chat';
import { DoctorLayout } from '../features/doctor';
import { useUnreadCount } from '../features/notification';
import { PatientLayout, ReceptionLayout } from '../features/patient';
import {
  ADMIN_NOTIFICATIONS_PATH,
  DOCTOR_NOTIFICATIONS_PATH,
  PATIENT_NOTIFICATIONS_PATH,
  RECEPTION_NOTIFICATIONS_PATH,
} from '../shared/routes/notification-paths';
import type {
  RoleNavItem,
  RoleShellNotifications,
} from '../shared/ui/role-shell';
import { DOCTOR_NAV, PATIENT_NAV, RECEPTION_NAV } from './role-nav';

// Ba khung vai trò đã nối menu (role-nav.ts) và chuông thông báo, dùng làm `element` ở role-routes.tsx (tách file vì luật fast refresh: file component chỉ export component).
// notification F1 (PLAN 5.10): router thăm dò số chưa đọc MỘT lần cho khung đang mở rồi truyền xuống layout qua prop, để `features/patient` và `features/doctor`
// không import `features/notification` (WTB-16). Các khung này nằm bên trong `RequireAuth` nên chỉ thăm dò khi đã đăng nhập đúng vai trò.
function useShellNotifications(to: string): RoleShellNotifications {
  const { unread, announce } = useUnreadCount();
  // Chưa có lần đọc nào thành công ⇒ 0 (ẩn số), không hiện số giả
  return { unread: unread ?? 0, announce, to };
}

// chat F1 (PLAN chat 5.13): số hội thoại chưa đọc thăm dò MỘT lần cho khung đang mở rồi điền vào mục "Tin nhắn" (`badge: 'messages'`) của menu.
// Điền vào mục (không thêm prop cho layout) nên `features/patient`, `features/doctor` không đổi và không import `features/chat`.
// chat F2: cùng chỗ này giữ kết nối WebSocket của nhắn tin (chỉ ba khung có "Tin nhắn"; khung Quản trị viên không gọi), khung gỡ thì đóng.
function useNavWithMessages(items: RoleNavItem[]): RoleNavItem[] {
  useChatConnection();
  const count = useChatUnreadCount();
  return items.map((item) =>
    item.badge === 'messages' ? { ...item, count } : item,
  );
}

export function PatientShell() {
  return (
    <PatientLayout
      {...PATIENT_NAV}
      items={useNavWithMessages(PATIENT_NAV.items)}
      notifications={useShellNotifications(PATIENT_NOTIFICATIONS_PATH)}
    />
  );
}

export function ReceptionShell() {
  return (
    <ReceptionLayout
      {...RECEPTION_NAV}
      items={useNavWithMessages(RECEPTION_NAV.items)}
      notifications={useShellNotifications(RECEPTION_NOTIFICATIONS_PATH)}
    />
  );
}

// notification F3: khung Quản trị viên (cả hai phạm vi), cùng cách nối chuông như ba khung trên
export function AdminShell() {
  return (
    <AdminLayout
      notifications={useShellNotifications(ADMIN_NOTIFICATIONS_PATH)}
    />
  );
}

export function DoctorShell() {
  return (
    <DoctorLayout
      {...DOCTOR_NAV}
      items={useNavWithMessages(DOCTOR_NAV.items)}
      notifications={useShellNotifications(DOCTOR_NOTIFICATIONS_PATH)}
    />
  );
}
