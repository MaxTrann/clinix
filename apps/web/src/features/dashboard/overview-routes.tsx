import type { RouteObject } from 'react-router';
import { LoadingState } from '../../shared/ui/loading-state';
import { AdminScopeGuard } from '../admin';
import { LOADING_TEXT } from './admin/loading-text';

// Route `index` của khung Admin (`/admin`, dashboard F1; ADR 0002: `lazy`). Bọc `AdminScopeGuard policy="Any"`: cả hai phạm vi vào được; phạm vi do API
// cưỡng bức. Cổng vai trò do `RequireAuth roles={['QuanTriVien']}` của `createRoleRoutes` bọc cả khối.
export const ADMIN_OVERVIEW_ROUTES: RouteObject[] = [
  {
    element: <AdminScopeGuard policy="Any" />,
    children: [
      {
        index: true,
        hydrateFallbackElement: <LoadingState message={LOADING_TEXT} />,
        lazy: () =>
          import('./admin/overview-page').then((module) => ({
            Component: module.AdminOverviewPage,
          })),
      },
    ],
  },
];
