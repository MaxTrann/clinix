import type { RouteObject } from 'react-router';
import { AdminScopeGuard } from '../../../admin';
import { ADMIN_REVIEWS_SEGMENT } from './reviews-paths';

// Route con của khung Admin (tương đối với `/admin`); `router/role-routes.tsx` ghép cạnh `ADMIN_ROUTES` (doctor-exam F7; WKD-01). Bọc `AdminScopeGuard policy="Any"`: cả Toàn hệ thống lẫn Chi nhánh vào được
// (phạm vi dữ liệu do máy chủ ép); vai trò khác đã bị `RequireAuth roles` của khối `QuanTriVien` chặn.
export const ADMIN_REVIEWS_ROUTES: RouteObject[] = [
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      {
        path: ADMIN_REVIEWS_SEGMENT,
        lazy: () =>
          import('./reviews-page').then((module) => ({
            Component: module.ReviewsPage,
          })),
      },
    ],
  },
];
