import { Navigate, type RouteObject } from 'react-router';
import { ADMIN_ROUTES } from '../features/admin/admin-routes';
import { AdminErrorBoundary } from '../features/admin/admin-error-boundary';
import { AdminLayout } from '../features/admin/admin-layout';
import {
  RequireAuth,
  ROLE_HOME_PATHS,
  RolePlaceholderPage,
  type VaiTro,
} from '../features/auth';
import {
  PATIENT_PATHS,
  PATIENT_ROUTES,
  PatientLayout,
} from '../features/patient';
import { ShellContentError } from '../shared/ui/shell-content-error';
import { PATIENT_NAV } from './role-nav';

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
        ],
      },
    ],
  },
  BacSi: { path: ROLE_HOME_PATHS.BacSi, element: <RolePlaceholderPage /> },
  LeTan: { path: ROLE_HOME_PATHS.LeTan, element: <RolePlaceholderPage /> },
  QuanTriVien: {
    path: ROLE_HOME_PATHS.QuanTriVien,
    element: <AdminLayout />,
    children: ADMIN_ROUTES,
    errorElement: <AdminErrorBoundary />,
  },
};

export function createRoleRoutes(): RouteObject[] {
  return (Object.keys(ROLE_ROUTES) as VaiTro[]).map((vaiTro) => ({
    element: <RequireAuth roles={[vaiTro]} />,
    children: [ROLE_ROUTES[vaiTro]],
  }));
}
