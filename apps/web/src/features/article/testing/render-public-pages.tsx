import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { ArticleApi } from '../api/article-api';
import { ArticleApiContext } from '../api/article-api-context';
import { ArticleDetailPage } from '../public/article-detail-page';
import { ArticleListPage } from '../public/article-list-page';

// Dựng hai trang công khai bài viết trong một router nhỏ (không cần khung `PublicLayout`) cho test mức trang. `api` là bản giả (`createFakeArticleApi`);
// không truyền thì trang dùng lớp HTTP thật (test tự stub `fetch`). `extra` là phần tử vẽ thêm ngoài router (ví dụ nút đổi chi nhánh). Dữ liệu giả, không phải của ai.
export function renderPublicPages(
  options: { api?: ArticleApi; path?: string; extra?: ReactNode } = {},
) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Trang chủ giả</p> },
      { path: '/cam-nang', element: <ArticleListPage /> },
      { path: '/cam-nang/:idSlug', element: <ArticleDetailPage /> },
    ],
    { initialEntries: [options.path ?? '/cam-nang'] },
  );
  const tree = (
    <>
      {options.extra}
      <RouterProvider router={router} />
    </>
  );
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
