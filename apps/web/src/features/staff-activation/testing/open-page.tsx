import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import type { ActivationLink } from '../activation-link';
import { STAFF_ACTIVATION_PATH } from '../staff-activation-paths';
import { fragmentOf } from './link-factory';

// Mở trang như người dùng bấm liên kết trong thư: URL THẬT của cửa sổ (nơi trang đọc `location.hash` và xoá nó) được đặt trước, và router
// bộ nhớ nhận cùng URL đó (kể cả fragment) để giống `createBrowserRouter`. Dùng cây route thật của ứng dụng.
export function openAt(url: string, options: { strict?: boolean } = {}) {
  window.history.replaceState(null, '', url);
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [url],
  });
  const tree = <RouterProvider router={router} />;
  render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  return router;
}

export function openActivation(
  link: ActivationLink,
  options: { strict?: boolean } = {},
) {
  return openAt(`${STAFF_ACTIVATION_PATH}${fragmentOf(link)}`, options);
}
