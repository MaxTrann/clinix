import type { RouteObject } from 'react-router';
import {
  PATIENT_APPOINTMENT_DETAIL_SEGMENT,
  PATIENT_APPOINTMENT_RESCHEDULE_CONFIRM_SEGMENT,
  PATIENT_APPOINTMENT_RESCHEDULE_SEGMENT,
  PATIENT_APPOINTMENTS_SEGMENT,
} from '../../../../shared/routes/booking-paths';

// Route con của khung Bệnh nhân (đường dẫn tương đối với `/benh-nhan`; ADR 0002: `lazy`, mảng `RouteObject[]` để `router/role-routes.tsx` ghép cạnh
// `PATIENT_ROUTES`). Cổng theo vai trò do `RequireAuth roles={['BenhNhan']}` của `createRoleRoutes` bọc cả khối nên vai khác không vào.
// F2 thêm route chi tiết vào CHÍNH mảng này nên không phải chạm `router/` (TRACKING 3.27 F2-G); reschedule F1 thêm hai route đổi lịch (trang chọn khung giờ và màn xác nhận) theo cùng nếp.
export const PATIENT_APPOINTMENT_ROUTES: RouteObject[] = [
  {
    path: PATIENT_APPOINTMENTS_SEGMENT,
    lazy: () =>
      import('./appointment-list-page').then((module) => ({
        Component: module.AppointmentListPage,
      })),
  },
  {
    path: PATIENT_APPOINTMENT_DETAIL_SEGMENT,
    lazy: () =>
      import('./detail/appointment-detail-page').then((module) => ({
        Component: module.AppointmentDetailPage,
      })),
  },
  {
    path: PATIENT_APPOINTMENT_RESCHEDULE_SEGMENT,
    lazy: () =>
      import('./reschedule/reschedule-page').then((module) => ({
        Component: module.ReschedulePage,
      })),
  },
  {
    path: PATIENT_APPOINTMENT_RESCHEDULE_CONFIRM_SEGMENT,
    lazy: () =>
      import('./reschedule/reschedule-confirm-page').then((module) => ({
        Component: module.RescheduleConfirmPage,
      })),
  },
];
