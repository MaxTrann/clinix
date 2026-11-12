import { Navigate, type RouteObject } from 'react-router';
import { ADMIN_ROUTES } from '../features/admin/admin-routes';
import { AdminErrorBoundary } from '../features/admin/admin-error-boundary';
import { AdminLayout } from '../features/admin/admin-layout';
import { RequireAuth, ROLE_HOME_PATHS, type VaiTro } from '../features/auth';
import {
  ADMIN_APPROVALS_ROUTES,
  ADMIN_SCHEDULE_ROUTES,
  DOCTOR_PATHS,
  DOCTOR_ROUTES,
  DoctorLayout,
  RECEPTION_SCHEDULE_ROUTES,
} from '../features/doctor';
import {
  ADMIN_PROFILE_ROUTES,
  PATIENT_PATHS,
  PATIENT_ROUTES,
  PatientLayout,
  RECEPTION_PATHS,
  RECEPTION_ROUTES,
  ReceptionLayout,
} from '../features/patient';
import {
  PATIENT_APPOINTMENT_ROUTES,
  RECEPTION_APPOINTMENT_ROUTES,
} from '../features/booking';
import { ShellContentError } from '../shared/ui/shell-content-error';
import { DOCTOR_NAV, PATIENT_NAV, RECEPTION_NAV } from './role-nav';

// Bảng "vai trò ⇒ route". Khi trang thật xong, chỉ thay ĐÚNG mục của vai trò đó (ví dụ admin F1 thay QuanTriVien); cổng theo vai trò do hàm dưới gắn.
const ROLE_ROUTES: Record<VaiTro, RouteObject> = {
  // patient F1: khung Bệnh nhân. Module khác cắm trang bằng cách thêm route vào mảng con dưới (cạnh PATIENT_ROUTES)
  // và đặt `to` cho mục menu ở role-nav.ts (docs/features/patient/TRACKING.md F1-E)
  BenhNhan: {
    path: ROLE_HOME_PATHS.BenhNhan,
    element: <PatientLayout {...PATIENT_NAV} />,
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
        ],
      },
    ],
  },
  // doctor F1: khung Bác sĩ, cùng khuôn với BenhNhan. Module khác cắm trang cạnh DOCTOR_ROUTES và đặt `to` ở role-nav.ts
  BacSi: {
    path: ROLE_HOME_PATHS.BacSi,
    element: <DoctorLayout {...DOCTOR_NAV} />,
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
        ],
      },
    ],
  },
  // patient F2: khung Lễ tân, cùng khuôn với BenhNhan. Module khác cắm trang cạnh RECEPTION_ROUTES (TRACKING F2-D)
  LeTan: {
    path: ROLE_HOME_PATHS.LeTan,
    element: <ReceptionLayout {...RECEPTION_NAV} />,
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
        ],
      },
    ],
  },
  QuanTriVien: {
    path: ROLE_HOME_PATHS.QuanTriVien,
    element: <AdminLayout />,
    // doctor F6, F8: Lịch làm việc bác sĩ và Duyệt yêu cầu của Quản trị viên (đã bọc AdminScopeGuard ở từng mảng route)
    children: [
      ...ADMIN_ROUTES,
      ...ADMIN_PROFILE_ROUTES,
      ...ADMIN_SCHEDULE_ROUTES,
      ...ADMIN_APPROVALS_ROUTES,
    ],
    errorElement: <AdminErrorBoundary />,
  },
};

export function createRoleRoutes(): RouteObject[] {
  return (Object.keys(ROLE_ROUTES) as VaiTro[]).map((vaiTro) => ({
    element: <RequireAuth roles={[vaiTro]} />,
    children: [ROLE_ROUTES[vaiTro]],
  }));
}
