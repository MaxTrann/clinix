import type { RouteObject } from 'react-router';
import {
  RECEPTION_RESCHEDULE_REQUEST_DETAIL_SEGMENT,
  RECEPTION_RESCHEDULE_REQUESTS_SEGMENT,
} from '../../../../../shared/routes/booking-paths';

// Route con "Yêu cầu đổi lịch" của khung Lễ tân (reschedule F4; đường dẫn tương đối với `/le-tan`; ADR 0002: `lazy`). Cắm vào mảng `RECEPTION_APPOINTMENT_ROUTES` (một dòng spread) nên KHÔNG phải sửa
// `router/role-routes.tsx`. Cổng theo vai trò do `RequireAuth roles={['LeTan']}` của `createRoleRoutes` bọc cả khối nên vai khác không vào. Hai route: danh sách và TRANG chi tiết một yêu cầu.
export const RECEPTION_RESCHEDULE_REQUEST_ROUTES: RouteObject[] = [
  {
    path: RECEPTION_RESCHEDULE_REQUESTS_SEGMENT,
    lazy: () =>
      import('./reception-requests-pages').then((module) => ({
        Component: module.ReceptionRescheduleRequestsPage,
      })),
  },
  {
    path: RECEPTION_RESCHEDULE_REQUEST_DETAIL_SEGMENT,
    lazy: () =>
      import('./reception-requests-pages').then((module) => ({
        Component: module.ReceptionRescheduleRequestDetailRoute,
      })),
  },
];
