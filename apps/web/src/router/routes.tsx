import type { RouteObject } from 'react-router';
import { AUTH_PAGE_ROUTES, RequireAuth } from '../features/auth';
import { HomePage } from '../pages/home-page';
import { NotFoundPage } from '../pages/not-found-page';
import { RouteErrorPage } from '../pages/route-error-page';
import { LoadingState } from '../shared/ui/loading-state';
import { createRoleRoutes } from './role-routes';
import { RootLayout } from './root-layout';

// `protectedChildren`: route cần đăng nhập, mọi vai trò. Route theo vai trò nằm ở role-routes.tsx.
export function createAppRoutes(
  protectedChildren: RouteObject[] = [],
): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      errorElement: <RouteErrorPage />,
      // Mở thẳng route `lazy`: router chờ chunk rồi mới render, thiếu dòng này thì màn hình trắng (đo thật ở F3)
      hydrateFallbackElement: <LoadingState />,
      children: [
        { index: true, element: <HomePage /> },
        ...AUTH_PAGE_ROUTES,
        { element: <RequireAuth />, children: protectedChildren },
        ...createRoleRoutes(),
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
