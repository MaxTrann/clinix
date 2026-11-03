import type { RouteObject } from 'react-router';
import { AdminScopeGuard } from './admin-scope-guard';
import { AdminOverviewPage } from './admin-overview-page';
import { LoadingState } from '../../shared/ui/loading-state';
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
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      {
        path: 'thong-tin-phong-kham',
        hydrateFallbackElement: (
          <LoadingState message="Đang tải thông tin phòng khám…" />
        ),
        lazy: () =>
          import('./clinic-info/clinic-info-page').then((module) => ({
            Component: module.ClinicInfoPage,
          })),
      },
    ],
  },
];
