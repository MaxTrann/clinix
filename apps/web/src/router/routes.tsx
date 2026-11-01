import type { RouteObject } from 'react-router';
import {
  LOGIN_PATH,
  LoginPlaceholderPage,
  RequireAuth,
} from '../features/auth';
import { HomePage } from '../pages/home-page';
import { NotFoundPage } from '../pages/not-found-page';
import { RouteErrorPage } from '../pages/route-error-page';
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
      children: [
        { index: true, element: <HomePage /> },
        { path: LOGIN_PATH, element: <LoginPlaceholderPage /> },
        { element: <RequireAuth />, children: protectedChildren },
        ...createRoleRoutes(),
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
