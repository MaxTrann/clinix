import type { RouteObject } from 'react-router';
import { AdminScopeGuard } from './admin-scope-guard';
import { AdminOverviewPage } from './admin-overview-page';
import { SpecialtyPage } from './specialties/specialty-page';

export const ADMIN_ROUTES: RouteObject[] = [
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      { index: true, element: <AdminOverviewPage /> },
      { path: 'chuyen-khoa', element: <SpecialtyPage /> },
      {
        path: 'dich-vu-kham',
        lazy: () =>
          import('./service-catalog/service-catalog-page').then((module) => ({
            Component: module.ServiceCatalogPage,
          })),
      },
    ],
  },
];
