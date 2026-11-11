import type { RouteObject } from 'react-router';
import { AdminScopeGuard } from '../../../admin';
import { ADMIN_SCHEDULE_SEGMENT } from './admin-schedule-paths';

// Route con của khung Admin (đường dẫn tương đối với `/admin`); router/role-routes.tsx ghép cạnh ADMIN_ROUTES. Bọc `AdminScopeGuard policy="Any"`:
// cả Toàn hệ thống lẫn Chi nhánh vào được (phạm vi dữ liệu do server ép, WA-01).
export const ADMIN_SCHEDULE_ROUTES: RouteObject[] = [
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      {
        path: ADMIN_SCHEDULE_SEGMENT,
        lazy: () =>
          import('./admin-schedule-page').then((module) => ({
            Component: module.AdminSchedulePage,
          })),
      },
    ],
  },
];
