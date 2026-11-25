import type { RouteObject } from 'react-router';
import { NOTIFICATIONS_SEGMENT } from '../../shared/routes/notification-paths';

// Route con "Thông báo" (đường dẫn tương đối với gốc khung; ADR 0002: `lazy`). Một mảng dùng cho cả ba khung Bệnh nhân, Lễ tân, Bác sĩ vì đoạn đường giống nhau
// (PLAN 5.10: một trang cho mọi vai trò); cổng vai trò do `RequireAuth` của từng khối ở `router/role-routes.tsx` bọc. Khung Admin gắn ở notification F3.
export const NOTIFICATION_ROUTES: RouteObject[] = [
  {
    path: NOTIFICATIONS_SEGMENT,
    lazy: () =>
      import('./pages/notification-center-page').then((module) => ({
        Component: module.NotificationCenterPage,
      })),
  },
];
