import type { RouteObject } from 'react-router';
import { PATIENT_APPOINTMENTS_SEGMENT } from '../../../../shared/routes/booking-paths';

// Route con của khung Bệnh nhân (đường dẫn tương đối với `/benh-nhan`; ADR 0002: `lazy`, mảng `RouteObject[]` để `router/role-routes.tsx` ghép cạnh
// `PATIENT_ROUTES`). Cổng theo vai trò do `RequireAuth roles={['BenhNhan']}` của `createRoleRoutes` bọc cả khối nên vai khác không vào.
export const PATIENT_APPOINTMENT_ROUTES: RouteObject[] = [
  {
    path: PATIENT_APPOINTMENTS_SEGMENT,
    lazy: () =>
      import('./appointment-list-page').then((module) => ({
        Component: module.AppointmentListPage,
      })),
  },
];
