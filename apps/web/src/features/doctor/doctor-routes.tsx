import type { RouteObject } from 'react-router';
import { DOCTOR_SCHEDULE_SEGMENT } from './shell/doctor-paths';

// Route con của khung Bác sĩ (đường dẫn tương đối với `/bac-si-portal`). Route chỉ mục và route của module khác do router/role-routes.tsx ghép.
export const DOCTOR_ROUTES: RouteObject[] = [
  {
    path: DOCTOR_SCHEDULE_SEGMENT,
    lazy: () =>
      import('./pages/doctor-schedule-page').then((module) => ({
        Component: module.DoctorSchedulePage,
      })),
  },
];
