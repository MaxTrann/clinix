import type { RouteObject } from 'react-router';
import { PATIENT_EXAM_RECORDS_SEGMENT } from './patient-exam-paths';

// Route con của khung Bệnh nhân (đường dẫn tương đối với `/benh-nhan`; ADR 0002: `lazy`, mảng `RouteObject[]` để `router/role-routes.tsx` ghép cạnh `PATIENT_ROUTES` và `PATIENT_APPOINTMENT_ROUTES`; doctor-exam F5, PLAN 5.13).
// Cổng theo vai trò do `RequireAuth roles={['BenhNhan']}` của `createRoleRoutes` bọc cả khối nên vai khác không vào.
export const PATIENT_EXAM_ROUTES: RouteObject[] = [
  {
    path: PATIENT_EXAM_RECORDS_SEGMENT,
    lazy: () =>
      import('./exam-records-page').then((module) => ({
        Component: module.ExamRecordsPage,
      })),
  },
];
