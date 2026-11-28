import type { RouteObject } from 'react-router';
import { ARTICLE_LIST_PATH } from '../common/article-paths';
import { ARTICLE_DETAIL_PARAM } from './article-public-paths';

// Route công khai của module (PLAN article 5.12, article F2): ghép TRONG khung `PublicLayout` ở `router/routes.tsx` (header, footer công khai). Đường dẫn tương đối với `/`.
// `lazy` như `admin/article-routes.tsx`: trang chỉ tải khi vào; `HomeHandbookSection` thì import tĩnh vì nằm ngay trang chủ.
const LIST_SEGMENT = ARTICLE_LIST_PATH.replace(/^\//, '');

export const ARTICLE_PUBLIC_ROUTES: RouteObject[] = [
  {
    path: LIST_SEGMENT,
    lazy: () =>
      import('./article-list-page').then((module) => ({
        Component: module.ArticleListPage,
      })),
  },
  {
    path: `${LIST_SEGMENT}/:${ARTICLE_DETAIL_PARAM}`,
    lazy: () =>
      import('./article-detail-page').then((module) => ({
        Component: module.ArticleDetailPage,
      })),
  },
];
