import type { RouteObject } from 'react-router';
import {
  PATIENT_PROFILE_SEGMENT,
  RECEPTION_LOOKUP_SEGMENT,
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
      import('./pages/reception-lookup-placeholder-page').then((module) => ({
        Component: module.ReceptionLookupPlaceholderPage,
      })),
  },
];
