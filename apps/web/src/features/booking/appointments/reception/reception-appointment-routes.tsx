import type { RouteObject } from 'react-router';
import {
  RECEPTION_APPOINTMENT_DETAIL_SEGMENT,
  RECEPTION_APPOINTMENTS_SEGMENT,
} from '../../../../shared/routes/booking-paths';

// Route con của khung Lễ tân (đường dẫn tương đối với `/le-tan`; ADR 0002: `lazy`, mảng `RouteObject[]` để `router/role-routes.tsx` ghép cạnh `RECEPTION_ROUTES`).
// Cổng theo vai trò do `RequireAuth roles={['LeTan']}` của `createRoleRoutes` bọc cả khối nên vai khác không vào. Hai route: danh sách và TRANG chi tiết một lịch (F12b; F8, F9 làm ngăn kéo trên
// cùng trang, không có route riêng): cắm vào MẢNG NÀY nên không phải sửa `router/role-routes.tsx`.
export const RECEPTION_APPOINTMENT_ROUTES: RouteObject[] = [
  {
    path: RECEPTION_APPOINTMENTS_SEGMENT,
    lazy: () =>
      import('./reception-list-page').then((module) => ({
        Component: module.ReceptionListPage,
      })),
  },
  {
    path: RECEPTION_APPOINTMENT_DETAIL_SEGMENT,
    lazy: () =>
      import('./detail/reception-detail-page').then((module) => ({
        Component: module.ReceptionDetailRoute,
      })),
  },
];
