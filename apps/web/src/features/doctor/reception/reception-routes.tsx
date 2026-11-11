import type { RouteObject } from 'react-router';
import { RECEPTION_SCHEDULE_SEGMENT } from './reception-paths';

// Route con của khung Lễ tân (đường dẫn tương đối với `/le-tan`); router/role-routes.tsx ghép cạnh RECEPTION_ROUTES của patient.
export const RECEPTION_SCHEDULE_ROUTES: RouteObject[] = [
  {
    path: RECEPTION_SCHEDULE_SEGMENT,
    lazy: () =>
      import('./reception-schedule-page').then((module) => ({
        Component: module.ReceptionSchedulePage,
      })),
  },
];
