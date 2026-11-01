import type { RouteObject } from 'react-router';
import { HomePage } from '../pages/home-page';
import { NotFoundPage } from '../pages/not-found-page';
import { RouteErrorPage } from '../pages/route-error-page';
import { AccessGate } from './access-gate';
import { RootLayout } from './root-layout';

// Route công khai của F1 thêm cạnh trang chủ. Cổng dưới đây KHOÁ CỨNG cho tới khi F1 thay bằng cổng đọc store,
// nên route protected thêm vào trước đó vẫn không lộ nội dung (người dùng chỉ thấy 404).
export function createAppRoutes(
  protectedChildren: RouteObject[] = [],
): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: <HomePage /> },
        {
          element: <AccessGate decision="denied" denied={<NotFoundPage />} />,
          children: protectedChildren,
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
