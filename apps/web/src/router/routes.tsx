import type { RouteObject } from 'react-router';
import { AUTH_PAGE_ROUTES, RequireAuth } from '../features/auth';
import {
  BranchDetailPage,
  BranchListPage,
  DoctorDetailPage,
  DoctorListPage,
  DoctorTeamPage,
  PublicLayout,
  ServiceGroupPage,
  ServiceListPage,
  SpecialtyDetailPage,
  SpecialtyListPage,
} from '../features/search';
import { HomePage } from '../pages/home-page';
import { NotFoundPage } from '../pages/not-found-page';
import { RouteErrorPage } from '../pages/route-error-page';
import { LoadingState } from '../shared/ui/loading-state';
import { createRoleRoutes } from './role-routes';
import { PUBLIC_NAV } from './public-nav';
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
        // Khung công khai (search F1): trang chủ, mọi trang công khai sau này và 404. Trang auth và khu vai trò nằm ngoài khung (KC-06).
        {
          element: <PublicLayout nav={PUBLIC_NAV} />,
          children: [
            { index: true, element: <HomePage /> },
            { path: 'chi-nhanh', element: <BranchListPage /> },
            { path: 'chi-nhanh/:id', element: <BranchDetailPage /> },
            { path: 'chuyen-khoa', element: <SpecialtyListPage /> },
            { path: 'chuyen-khoa/:id', element: <SpecialtyDetailPage /> },
            // Luồng chọn dịch vụ → bác sĩ (search F5, TCBS b1–b3)
            { path: 'dat-lich', element: <ServiceGroupPage /> },
            { path: 'dat-lich/nhom/:groupId', element: <ServiceListPage /> },
            {
              path: 'dat-lich/nhom/:groupId/dich-vu/:serviceId',
              element: <DoctorListPage />,
            },
            // "Đội ngũ bác sĩ" (search F6)
            { path: 'bac-si', element: <DoctorTeamPage /> },
            // Chi tiết bác sĩ (search F7)
            { path: 'bac-si/:id', element: <DoctorDetailPage /> },
            { path: '*', element: <NotFoundPage /> },
          ],
        },
        ...AUTH_PAGE_ROUTES,
        { element: <RequireAuth />, children: protectedChildren },
        ...createRoleRoutes(),
      ],
    },
  ];
}
