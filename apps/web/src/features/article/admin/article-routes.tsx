import type { RouteObject } from 'react-router';
import { AdminScopeGuard } from '../../admin';
import {
  ARTICLE_ADMIN_NEW_SEGMENT,
  ARTICLE_ADMIN_SEGMENT,
} from '../common/article-paths';

// Route con của khung Admin (tương đối với `/admin`); `router/role-routes.tsx` ghép cạnh `ADMIN_ROUTES` (article F1; T14, ABW-01). Bọc `AdminScopeGuard policy="ToanHeThong"`:
// chỉ Toàn hệ thống vào được, Admin Chi nhánh gõ đường dẫn thì thấy trang "Không đủ quyền truy cập" (máy chủ vẫn kiểm lại, 403). Vai trò khác đã bị `RequireAuth roles` của khối `QuanTriVien` chặn.
// `bai-viet/moi` đứng riêng trước `bai-viet/:id` (react-router ưu tiên đường dẫn tĩnh nên "moi" không bị coi là mã bài).
export const ARTICLE_ADMIN_ROUTES: RouteObject[] = [
  {
    element: <AdminScopeGuard policy="ToanHeThong" />,
    children: [
      {
        path: ARTICLE_ADMIN_SEGMENT,
        lazy: () =>
          import('./article-list-page').then((module) => ({
            Component: module.ArticleListPage,
          })),
      },
      {
        path: `${ARTICLE_ADMIN_SEGMENT}/${ARTICLE_ADMIN_NEW_SEGMENT}`,
        lazy: () =>
          import('./article-form-page').then((module) => ({
            Component: module.ArticleCreatePage,
          })),
      },
      {
        path: `${ARTICLE_ADMIN_SEGMENT}/:id`,
        lazy: () =>
          import('./article-form-page').then((module) => ({
            Component: module.ArticleEditPage,
          })),
      },
    ],
  },
];
