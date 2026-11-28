import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ArticleCreatePage, ArticleEditPage } from '../admin/article-form-page';
import { ArticleListPage } from '../admin/article-list-page';
import type { ArticleApi } from '../api/article-api';
import { ArticleApiContext } from '../api/article-api-context';

// Dựng ba trang quản trị bài viết trong một router nhỏ (không cần khung Admin) cho test mức trang. `api` là bản giả (`createFakeArticleApi`);
// không truyền thì trang dùng lớp HTTP thật (test tự stub `fetch`). Dữ liệu giả, không phải của ai.
export function renderArticlePages(
  options: { api?: ArticleApi; path?: string } = {},
) {
  const router = createMemoryRouter(
    [
      { path: '/admin/bai-viet', element: <ArticleListPage /> },
      { path: '/admin/bai-viet/moi', element: <ArticleCreatePage /> },
      { path: '/admin/bai-viet/:id', element: <ArticleEditPage /> },
    ],
    { initialEntries: [options.path ?? '/admin/bai-viet'] },
  );
  const tree = <RouterProvider router={router} />;
  const view = render(
    options.api === undefined ? (
      tree
    ) : (
      <ArticleApiContext.Provider value={options.api}>
        {tree}
      </ArticleApiContext.Provider>
    ),
  );
  return { router, ...view };
}
