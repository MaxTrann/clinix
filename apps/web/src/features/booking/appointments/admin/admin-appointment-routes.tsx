import type { RouteObject } from 'react-router';
import {
  ADMIN_APPOINTMENT_DETAIL_SEGMENT,
  ADMIN_APPOINTMENTS_SEGMENT,
} from '../../../../shared/routes/booking-paths';
import { AdminScopeGuard } from '../../../admin';

// Route con của khung Admin (đường dẫn tương đối với `/admin`; ADR 0002: `lazy`, mảng `RouteObject[]` để `router/role-routes.tsx` ghép cạnh `ADMIN_ROUTES`, đúng tiền lệ `ADMIN_SCHEDULE_ROUTES`
// của doctor). Bọc `AdminScopeGuard policy="Any"`: cả Toàn hệ thống lẫn Chi nhánh vào được (phạm vi dữ liệu do server ép). Cổng theo vai trò do `RequireAuth roles={['QuanTriVien']}` của
// `createRoleRoutes` bọc cả khối nên vai khác không vào. Hai route: danh sách và TRANG chi tiết một lịch (Figma `512:2`).
export const ADMIN_APPOINTMENT_ROUTES: RouteObject[] = [
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      {
        path: ADMIN_APPOINTMENTS_SEGMENT,
        lazy: () =>
          import('./admin-list-page').then((module) => ({
            Component: module.AdminListPage,
          })),
      },
      {
        path: ADMIN_APPOINTMENT_DETAIL_SEGMENT,
        lazy: () =>
          import('./detail/admin-detail-page').then((module) => ({
            Component: module.AdminDetailRoute,
          })),
      },
    ],
  },
];
