import type { RouteObject } from 'react-router';
import { PATIENT_PROFILE_SEGMENT } from './patient-paths';

// Route con của khung Bệnh nhân (đường dẫn tương đối với `/benh-nhan`). Route mặc định và route của module khác do router/role-routes.tsx ghép.
export const PATIENT_ROUTES: RouteObject[] = [
  {
    path: PATIENT_PROFILE_SEGMENT,
    lazy: () =>
      import('./pages/patient-profile-placeholder-page').then((module) => ({
        Component: module.PatientProfilePlaceholderPage,
      })),
  },
];
