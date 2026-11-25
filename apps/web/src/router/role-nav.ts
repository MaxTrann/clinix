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
import {
  DOCTOR_PATHS,
  PATIENT_EXAM_RECORDS_PATH,
  RECEPTION_SCHEDULE_PATH,
} from '../features/doctor';
import { PATIENT_PATHS, RECEPTION_PATHS } from '../features/patient';
import {
  DOCTOR_APPOINTMENTS_PATH,
  PATIENT_APPOINTMENTS_PATH,
  RECEPTION_APPOINTMENTS_PATH,
  RECEPTION_RESCHEDULE_REQUESTS_PATH,
} from '../shared/routes/booking-paths';
import {
  DOCTOR_NOTIFICATIONS_PATH,
  PATIENT_NOTIFICATIONS_PATH,
  RECEPTION_NOTIFICATIONS_PATH,
} from '../shared/routes/notification-paths';
import { PATIENT_WALLET_PATH } from '../shared/routes/wallet-paths';
import type { RoleNavItem } from '../shared/ui/role-shell';

// Menu của các khung theo vai trò (Q21d). Module có trang mới chỉ thêm `to` cho mục của mình ở đây và ghép route ở role-routes.tsx;
// mục chưa có `to` hiện là nút vô hiệu. Thứ tự và tên biểu tượng theo Figma `416:2` (Bệnh nhân), `483:2` (Lễ tân); hình khớp lucide-react
// trừ Calendar, ListOrdered, MessageCircle lệch nhẹ (Figma dùng bản vẽ cũ của lucide), xem docs/features/patient/TRACKING.md F2-B.
export const PATIENT_NAV: { items: RoleNavItem[]; footerItems: RoleNavItem[] } =
  {
    items: [
      { label: 'Tổng quan', icon: LayoutDashboard },
      // booking F1: không `end`, để trang con của F2 (chi tiết lịch hẹn) vẫn làm sáng mục này
      {
        label: 'Lịch hẹn của tôi',
        icon: Calendar,
        to: PATIENT_APPOINTMENTS_PATH,
      },
      // doctor-exam F5: trang Hồ sơ khám bệnh (không `end`, nếp các mục menu khác)
      {
        label: 'Hồ sơ khám bệnh',
        icon: ClipboardList,
        to: PATIENT_EXAM_RECORDS_PATH,
      },
      // payment F1: trang Ví của tôi (không `end`: trang kết quả nạp của F2 nằm dưới đường dẫn này vẫn sáng mục)
      { label: 'Ví của tôi', icon: Wallet, to: PATIENT_WALLET_PATH },
      { label: 'Danh sách chờ', icon: ListOrdered },
      { label: 'Tin nhắn', icon: MessageCircle },
      // notification F1: trang Thông báo, có số chưa đọc (TECH_DEBT 62)
      {
        label: 'Thông báo',
        icon: Bell,
        to: PATIENT_NOTIFICATIONS_PATH,
        badge: 'notifications',
      },
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
    // booking F8: không `end` (nếp mục menu khác). F12b: chi tiết một lịch là TRANG con (`/le-tan/quan-ly-lich-hen/:maLichHen`) nên mục này vẫn sáng ở đó nhờ không có `end` (UIF-18)
    {
      label: 'Quản lý lịch hẹn',
      icon: Calendar,
      to: RECEPTION_APPOINTMENTS_PATH,
    },
    { label: 'Tra cứu bệnh nhân', icon: Users, to: RECEPTION_PATHS.lookup },
    {
      label: 'Lịch làm việc bác sĩ',
      icon: Stethoscope,
      to: RECEPTION_SCHEDULE_PATH,
    },
    // reschedule F4: trang hai tab Chờ duyệt, Đã xử lý (không `end`: trang chi tiết một yêu cầu là trang con nên mục này vẫn sáng)
    {
      label: 'Yêu cầu đổi lịch',
      icon: RefreshCw,
      to: RECEPTION_RESCHEDULE_REQUESTS_PATH,
    },
    { label: 'Danh sách chờ', icon: ListOrdered },
    { label: 'Tin nhắn', icon: MessageCircle },
    // notification F1: trang Thông báo, có số chưa đọc (TECH_DEBT 62)
    {
      label: 'Thông báo',
      icon: Bell,
      to: RECEPTION_NOTIFICATIONS_PATH,
      badge: 'notifications',
    },
    { label: 'Thông tin cá nhân', icon: User, to: RECEPTION_PATHS.profile },
  ],
};

// doctor F1 (Figma `466:2`). "Lịch hẹn" do `booking` F11 đặt `to` (doctor F10 gắn route); "Thông báo" do notification F1; "Tổng quan", "Tin nhắn", "Thông tin cá nhân" chưa có trang (nút vô hiệu).
export const DOCTOR_NAV: { items: RoleNavItem[] } = {
  items: [
    { label: 'Tổng quan', icon: LayoutDashboard },
    { label: 'Lịch hẹn', icon: Calendar, to: DOCTOR_APPOINTMENTS_PATH },
    { label: 'Lịch làm việc', icon: ClipboardList, to: DOCTOR_PATHS.schedule },
    { label: 'Tin nhắn', icon: MessageCircle },
    {
      label: 'Thông báo',
      icon: Bell,
      to: DOCTOR_NOTIFICATIONS_PATH,
      badge: 'notifications',
    },
    { label: 'Thông tin cá nhân', icon: User },
  ],
};
