import type { RouteObject } from 'react-router';
import {
  RECEPTION_APPOINTMENT_DETAIL_SEGMENT,
  RECEPTION_APPOINTMENT_RESCHEDULE_CONFIRM_SEGMENT,
  RECEPTION_APPOINTMENT_RESCHEDULE_SEGMENT,
  RECEPTION_APPOINTMENTS_SEGMENT,
} from '../../../../shared/routes/booking-paths';
import { RECEPTION_RESCHEDULE_REQUEST_ROUTES } from './reschedule-requests/reception-request-routes';

// Route con của khung Lễ tân (đường dẫn tương đối với `/le-tan`; ADR 0002: `lazy`, mảng `RouteObject[]` để `router/role-routes.tsx` ghép cạnh `RECEPTION_ROUTES`).
// Cổng theo vai trò do `RequireAuth roles={['LeTan']}` của `createRoleRoutes` bọc cả khối nên vai khác không vào. Hai route: danh sách và TRANG chi tiết một lịch (F12b; F8, F9 làm ngăn kéo trên
// cùng trang, không có route riêng): cắm vào MẢNG NÀY nên không phải sửa `router/role-routes.tsx`.
export const RECEPTION_APPOINTMENT_ROUTES: RouteObject[] = [
  // reschedule F4: hai route "Yêu cầu đổi lịch" (danh sách, chi tiết) ở thư mục riêng; đặt ở ĐẦU mảng để không chạm chỗ F3 thêm route (cuối mảng)
  ...RECEPTION_RESCHEDULE_REQUEST_ROUTES,
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
  // reschedule F3: đổi lịch HỘ bệnh nhân, hai route DƯỚI chi tiết lịch (trang chọn khung giờ và màn xác nhận); cùng nếp F1 của Bệnh nhân nên không chạm `router/role-routes.tsx`.
  {
    path: RECEPTION_APPOINTMENT_RESCHEDULE_SEGMENT,
    lazy: () =>
      import('./reschedule/reception-reschedule-page').then((module) => ({
        Component: module.ReceptionReschedulePage,
      })),
  },
  {
    path: RECEPTION_APPOINTMENT_RESCHEDULE_CONFIRM_SEGMENT,
    lazy: () =>
      import('./reschedule/reception-reschedule-confirm-page').then(
        (module) => ({
          Component: module.ReceptionRescheduleConfirmPage,
        }),
      ),
  },
];
