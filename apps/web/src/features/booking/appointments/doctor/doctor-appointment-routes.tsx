import type { RouteObject } from 'react-router';
import {
  DOCTOR_APPOINTMENT_DETAIL_SEGMENT,
  DOCTOR_APPOINTMENTS_SEGMENT,
} from '../../../../shared/routes/booking-paths';

// Route con của khung Bác sĩ (đường dẫn tương đối với `/bac-si-portal`; ADR 0002: `lazy`, mảng `RouteObject[]` để `router/role-routes.tsx` ghép cạnh `DOCTOR_ROUTES` của doctor). Cổng theo vai trò do
// `RequireAuth roles={['BacSi']}` của `createRoleRoutes` bọc cả khối nên vai khác không vào (404), khách về đăng nhập; phạm vi dữ liệu (`bac_si_id`) do backend ép, không có guard thứ hai ở đây. Hai route: danh
// sách và TRANG chi tiết một ca khám (Figma `458:2`). Chỉ xuất mảng route, không xuất trang (route đã `lazy`; Đại duyệt 14/11/2026, khác chữ PLAN D8 cũ).
export const DOCTOR_APPOINTMENT_ROUTES: RouteObject[] = [
  {
    path: DOCTOR_APPOINTMENTS_SEGMENT,
    lazy: () =>
      import('./doctor-list-page').then((module) => ({
        Component: module.DoctorAppointmentsPage,
      })),
  },
  {
    path: DOCTOR_APPOINTMENT_DETAIL_SEGMENT,
    lazy: () =>
      import('./detail/doctor-detail-page').then((module) => ({
        Component: module.DoctorDetailRoute,
      })),
  },
];
