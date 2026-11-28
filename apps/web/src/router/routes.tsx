import type { RouteObject } from 'react-router';
import {
  ARTICLE_PUBLIC_ROUTES,
  HomeHandbookSection,
} from '../features/article';
import { AUTH_PAGE_ROUTES, RequireAuth } from '../features/auth';
import { BOOKING_WIZARD_ROUTES } from '../features/booking';
import {
  BranchDetailPage,
  BranchListPage,
  DoctorDetailPage,
  DoctorListPage,
  DoctorTeamPage,
  HomePage,
  PublicLayout,
  ServiceGroupPage,
  ServiceListPage,
  SpecialtyDetailPage,
  SpecialtyListPage,
} from '../features/search';
import { STAFF_ACTIVATION_ROUTES } from '../features/staff-activation';
import { NotFoundPage } from '../pages/not-found-page';
import { LoadingState } from '../shared/ui/loading-state';
import { createRoleRoutes } from './role-routes';
import { PUBLIC_NAV } from './public-nav';
import { RootLayout } from './root-layout';
import { RouteErrorElement } from './route-error-element';

// `protectedChildren`: route cần đăng nhập, mọi vai trò. Route theo vai trò nằm ở role-routes.tsx.
export function createAppRoutes(
  protectedChildren: RouteObject[] = [],
): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      errorElement: <RouteErrorElement />,
      // Mở thẳng route `lazy`: router chờ chunk rồi mới render, thiếu dòng này thì màn hình trắng (đo thật ở F3)
      hydrateFallbackElement: <LoadingState />,
      children: [
        // Khung công khai (search F1): trang chủ, mọi trang công khai sau này và 404. Trang auth và khu vai trò nằm ngoài khung (KC-06).
        {
          element: <PublicLayout nav={PUBLIC_NAV} />,
          children: [
            // Khối "Cẩm nang sức khỏe" (article F2, T13): truyền qua khe để `features/search` không import `features/article`
            {
              index: true,
              element: <HomePage handbookSlot={<HomeHandbookSection />} />,
            },
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
            // Bước 4–6 của luồng đặt lịch (booking F3, Q36): cùng khung công khai, chỉ Bệnh nhân; vai khác 404, chưa đăng nhập thì tới đăng nhập kèm `from`
            {
              element: <RequireAuth roles={['BenhNhan']} />,
              children: BOOKING_WIZARD_ROUTES,
            },
            // "Đội ngũ bác sĩ" (search F6)
            { path: 'bac-si', element: <DoctorTeamPage /> },
            // Chi tiết bác sĩ (search F7)
            { path: 'bac-si/:id', element: <DoctorDetailPage /> },
            // "Cẩm nang sức khỏe" (article F2): danh sách `/cam-nang` và chi tiết `/cam-nang/:idSlug`
            ...ARTICLE_PUBLIC_ROUTES,
            { path: '*', element: <NotFoundPage /> },
          ],
        },
        ...AUTH_PAGE_ROUTES,
        ...STAFF_ACTIVATION_ROUTES,
        { element: <RequireAuth />, children: protectedChildren },
        ...createRoleRoutes(),
      ],
    },
  ];
}
