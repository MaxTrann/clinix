import type { RouteObject } from 'react-router';
import { ADMIN_ROUTES } from '../features/admin/admin-routes';
import { AdminErrorBoundary } from '../features/admin/admin-error-boundary';
import { AdminLayout } from '../features/admin/admin-layout';
import {
  RequireAuth,
  ROLE_HOME_PATHS,
  RolePlaceholderPage,
  type VaiTro,
} from '../features/auth';

// Bảng "vai trò ⇒ route". Khi trang thật xong, chỉ thay ĐÚNG mục của vai trò đó (ví dụ admin F1 thay QuanTriVien); cổng theo vai trò do hàm dưới gắn.
const ROLE_ROUTES: Record<VaiTro, RouteObject> = {
  BenhNhan: {
    path: ROLE_HOME_PATHS.BenhNhan,
    element: <RolePlaceholderPage />,
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
