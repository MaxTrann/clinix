import { Navigate, type RouteObject } from 'react-router';
import { ADMIN_ROUTES } from '../features/admin/admin-routes';
import { RequireAuth, ROLE_HOME_PATHS, type VaiTro } from '../features/auth';
import { CHAT_ROUTES, createChatRoutes } from '../features/chat';
import { DOCTOR_TEAM_PATH } from '../features/search';
import {
  createAdminApprovalsRoutes,
  ADMIN_REVIEWS_ROUTES,
  ADMIN_SCHEDULE_ROUTES,
  DOCTOR_PATHS,
  DOCTOR_ROUTES,
  PATIENT_EXAM_ROUTES,
  RECEPTION_SCHEDULE_ROUTES,
} from '../features/doctor';
import {
  ADMIN_PROFILE_ROUTES,
  PATIENT_PATHS,
  PATIENT_ROUTES,
  RECEPTION_PATHS,
  RECEPTION_ROUTES,
} from '../features/patient';
import {
  ADMIN_APPOINTMENT_ROUTES,
  ADMIN_RESCHEDULE_REQUEST_ROUTES,
  DOCTOR_APPOINTMENT_ROUTES,
  PATIENT_APPOINTMENT_ROUTES,
  RECEPTION_APPOINTMENT_ROUTES,
} from '../features/booking';
import { NOTIFICATION_ROUTES } from '../features/notification';
import { ADMIN_DEPOSIT_POLICY_ROUTES } from '../features/payment';
import {
  ADMIN_FINANCE_ROUTES,
  PATIENT_WALLET_ROUTES,
} from '../features/wallet';
import { ShellContentError } from '../shared/ui/shell-content-error';
import {
  AdminShell,
  DoctorShell,
  PatientShell,
  ReceptionShell,
} from './role-shells';
import { RouteErrorElement } from './route-error-element';

// Bảng "vai trò ⇒ route". Khi trang thật xong, chỉ thay ĐÚNG mục của vai trò đó (ví dụ admin F1 thay QuanTriVien); cổng theo vai trò do hàm dưới gắn.
const ROLE_ROUTES: Record<VaiTro, RouteObject> = {
  // patient F1: khung Bệnh nhân. Module khác cắm trang bằng cách thêm route vào mảng con dưới (cạnh PATIENT_ROUTES)
  // và đặt `to` cho mục menu ở role-nav.ts (docs/features/patient/TRACKING.md F1-E)
  BenhNhan: {
    path: ROLE_HOME_PATHS.BenhNhan,
    element: <PatientShell />,
    children: [
      {
        // Lỗi của trang con hiện trong vùng nội dung, khung vẫn còn (F1-F)
        errorElement: <ShellContentError />,
        children: [
          // Chưa có "Tổng quan": chuyển tới Hồ sơ người khám (Q21e). Dùng phần tử chứ không dùng loader để chạy SAU cổng RequireAuth
          {
            index: true,
            element: <Navigate to={PATIENT_PATHS.profile} replace />,
          },
          ...PATIENT_ROUTES,
          // booking F1: Lịch hẹn của tôi
          ...PATIENT_APPOINTMENT_ROUTES,
          // doctor-exam F5: Hồ sơ khám bệnh của Bệnh nhân
          ...PATIENT_EXAM_ROUTES,
          // payment F1: Ví của tôi
          ...PATIENT_WALLET_ROUTES,
          // notification F1: Thông báo
          ...NOTIFICATION_ROUTES,
          // chat F1: Tin nhắn; chat F4: nút "Nhắn bác sĩ" dẫn tới trang tra cứu bác sĩ (Q24)
          ...createChatRoutes({ doctorSearchPath: DOCTOR_TEAM_PATH }),
        ],
      },
    ],
  },
  // doctor F1: khung Bác sĩ, cùng khuôn với BenhNhan. Module khác cắm trang cạnh DOCTOR_ROUTES và đặt `to` ở role-nav.ts
  BacSi: {
    path: ROLE_HOME_PATHS.BacSi,
    element: <DoctorShell />,
    children: [
      {
        errorElement: <ShellContentError />,
        children: [
          // Chưa có "Tổng quan": chuyển tới Lịch làm việc (như patient Q21e)
          {
            index: true,
            element: <Navigate to={DOCTOR_PATHS.schedule} replace />,
          },
          ...DOCTOR_ROUTES,
          // booking F11: Lịch hẹn của Bác sĩ
          ...DOCTOR_APPOINTMENT_ROUTES,
          // notification F1: Thông báo
          ...NOTIFICATION_ROUTES,
          // chat F1: Tin nhắn; chat F5: hộp thư của Bác sĩ (tìm theo họ tên, quan hệ khám; không tự tạo hội thoại)
          ...CHAT_ROUTES,
        ],
      },
    ],
  },
  // patient F2: khung Lễ tân, cùng khuôn với BenhNhan. Module khác cắm trang cạnh RECEPTION_ROUTES (TRACKING F2-D)
  LeTan: {
    path: ROLE_HOME_PATHS.LeTan,
    element: <ReceptionShell />,
    children: [
      {
        errorElement: <ShellContentError />,
        children: [
          // Chưa có "Tổng quan": chuyển tới Tra cứu bệnh nhân (Q21e)
          {
            index: true,
            element: <Navigate to={RECEPTION_PATHS.lookup} replace />,
          },
          ...RECEPTION_ROUTES,
          // booking F8: Quản lý lịch hẹn
          ...RECEPTION_APPOINTMENT_ROUTES,
          // doctor F5: Lịch làm việc bác sĩ của Lễ tân
          ...RECEPTION_SCHEDULE_ROUTES,
          // notification F1: Thông báo
          ...NOTIFICATION_ROUTES,
          // chat F1: Tin nhắn; chat F5: hộp thư chung của chi nhánh (tìm theo họ tên, SĐT, email; nhãn trả lời)
          ...CHAT_ROUTES,
        ],
      },
    ],
  },
  QuanTriVien: {
    path: ROLE_HOME_PATHS.QuanTriVien,
    element: <AdminShell />,
    // doctor F6, F8: Lịch làm việc bác sĩ và Duyệt yêu cầu của Quản trị viên (đã bọc AdminScopeGuard ở từng mảng route)
    children: [
      ...ADMIN_ROUTES,
      ...ADMIN_PROFILE_ROUTES,
      ...ADMIN_SCHEDULE_ROUTES,
      // reschedule F5: route con của booking truyền vào trang host của doctor
      ...createAdminApprovalsRoutes(ADMIN_RESCHEDULE_REQUEST_ROUTES),
      // doctor-exam F7: Kiểm duyệt đánh giá của Quản trị viên (đã bọc AdminScopeGuard)
      ...ADMIN_REVIEWS_ROUTES,
      // booking F10: Lịch hẹn của Quản trị viên (đã bọc AdminScopeGuard)
      ...ADMIN_APPOINTMENT_ROUTES,
      // payment F5: Đặt cọc & Hoàn tiền (đã bọc AdminScopeGuard ToanHeThong)
      ...ADMIN_DEPOSIT_POLICY_ROUTES,
      // payment F7: Quản lý tài chính ví, tab Yêu cầu rút tiền (đã bọc AdminScopeGuard ToanHeThong)
      ...ADMIN_FINANCE_ROUTES,
      // notification F3: Thông báo (cả hai phạm vi: dữ liệu của chính tài khoản, không bọc AdminScopeGuard)
      ...NOTIFICATION_ROUTES,
    ],
    // doctor UX4 (G18): cùng màn 500 với route gốc (thay AdminErrorBoundary)
    errorElement: <RouteErrorElement />,
  },
};

export function createRoleRoutes(): RouteObject[] {
  return (Object.keys(ROLE_ROUTES) as VaiTro[]).map((vaiTro) => ({
    element: <RequireAuth roles={[vaiTro]} />,
    children: [ROLE_ROUTES[vaiTro]],
  }));
}
