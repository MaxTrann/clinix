import type { RouteObject } from 'react-router';
import {
  ADMIN_RESCHEDULE_REQUEST_ID_SEGMENT,
  ADMIN_RESCHEDULE_REQUESTS_SEGMENT,
} from '../../../../../shared/routes/booking-paths';

// Route con của trang "Duyệt yêu cầu" của Quản trị viên (reschedule F5; đường dẫn tương đối với `/admin/duyet-yeu-cau`; ADR 0002: `lazy`). Module doctor sở hữu trang host và không được import booking (WHT-10), nên
// `router/role-routes.tsx` truyền mảng này vào `createAdminApprovalsRoutes`. Không tự bọc `AdminScopeGuard`: nằm dưới guard `policy="Any"` của khối cha (cả Toàn hệ thống lẫn Chi nhánh; phạm vi dữ liệu do server
// ép). Một route cha giữ chi nhánh đã chọn, hai con: danh sách và TRANG chi tiết một yêu cầu.
export const ADMIN_RESCHEDULE_REQUEST_ROUTES: RouteObject[] = [
  {
    path: ADMIN_RESCHEDULE_REQUESTS_SEGMENT,
    lazy: () =>
      import('./admin-requests-layout').then((module) => ({
        Component: module.AdminRescheduleRequestsLayout,
      })),
    children: [
      {
        index: true,
        lazy: () =>
          import('./admin-requests-pages').then((module) => ({
            Component: module.AdminRescheduleRequestsPage,
          })),
      },
      {
        path: ADMIN_RESCHEDULE_REQUEST_ID_SEGMENT,
        lazy: () =>
          import('./admin-requests-pages').then((module) => ({
            Component: module.AdminRescheduleRequestDetailRoute,
          })),
      },
    ],
  },
];
