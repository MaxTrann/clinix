import { AdminLayout } from '../features/admin/admin-layout';
import { DoctorLayout } from '../features/doctor';
import { useUnreadCount } from '../features/notification';
import { PatientLayout, ReceptionLayout } from '../features/patient';
import {
  ADMIN_NOTIFICATIONS_PATH,
  DOCTOR_NOTIFICATIONS_PATH,
  PATIENT_NOTIFICATIONS_PATH,
  RECEPTION_NOTIFICATIONS_PATH,
} from '../shared/routes/notification-paths';
import type { RoleShellNotifications } from '../shared/ui/role-shell';
import { DOCTOR_NAV, PATIENT_NAV, RECEPTION_NAV } from './role-nav';

// Ba khung vai trò đã nối menu (role-nav.ts) và chuông thông báo, dùng làm `element` ở role-routes.tsx (tách file vì luật fast refresh: file component chỉ export component).
// notification F1 (PLAN 5.10): router thăm dò số chưa đọc MỘT lần cho khung đang mở rồi truyền xuống layout qua prop, để `features/patient` và `features/doctor`
// không import `features/notification` (WTB-16). Các khung này nằm bên trong `RequireAuth` nên chỉ thăm dò khi đã đăng nhập đúng vai trò.
function useShellNotifications(to: string): RoleShellNotifications {
  const { unread, announce } = useUnreadCount();
  // Chưa có lần đọc nào thành công ⇒ 0 (ẩn số), không hiện số giả
  return { unread: unread ?? 0, announce, to };
}

export function PatientShell() {
  return (
    <PatientLayout
      {...PATIENT_NAV}
      notifications={useShellNotifications(PATIENT_NOTIFICATIONS_PATH)}
    />
  );
}

export function ReceptionShell() {
  return (
    <ReceptionLayout
      {...RECEPTION_NAV}
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
      notifications={useShellNotifications(DOCTOR_NOTIFICATIONS_PATH)}
    />
  );
}
