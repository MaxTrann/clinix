import type { RouteObject } from 'react-router';
import {
  ADMIN_PROFILE_SEGMENT,
  PATIENT_PROFILE_SEGMENT,
  RECEPTION_LOOKUP_SEGMENT,
  RECEPTION_PROFILE_SEGMENT,
} from './patient-paths';

// Route con của khung Bệnh nhân (đường dẫn tương đối với `/benh-nhan`). Route mặc định và route của module khác do router/role-routes.tsx ghép.
export const PATIENT_ROUTES: RouteObject[] = [
  {
    path: PATIENT_PROFILE_SEGMENT,
    lazy: () =>
      import('./pages/patient-profile-page').then((module) => ({
        Component: module.PatientProfilePage,
      })),
  },
];

// Route con của khung Lễ tân (đường dẫn tương đối với `/le-tan`, patient F2); ghép như PATIENT_ROUTES.
export const RECEPTION_ROUTES: RouteObject[] = [
  {
    path: RECEPTION_LOOKUP_SEGMENT,
    lazy: () =>
      import('./pages/reception-lookup-page').then((module) => ({
        Component: module.ReceptionLookupPage,
      })),
  },
  // patient F4: "Thông tin cá nhân" của Lễ tân
  {
    path: RECEPTION_PROFILE_SEGMENT,
    lazy: () =>
      import('./pages/reception-profile-page').then((module) => ({
        Component: module.ReceptionProfilePage,
      })),
  },
];

// Route con của khung Quản trị viên (đường dẫn tương đối với `/admin`, patient F5). `router/role-routes.tsx` ghép cạnh `ADMIN_ROUTES`;
// không bọc `AdminScopeGuard` (policy "Any" luôn cho qua, và không được import nội bộ của `features/admin`, TRACKING F5-G).
export const ADMIN_PROFILE_ROUTES: RouteObject[] = [
  {
    path: ADMIN_PROFILE_SEGMENT,
    lazy: () =>
      import('./pages/admin-profile-page').then((module) => ({
        Component: module.AdminProfilePage,
      })),
  },
];
