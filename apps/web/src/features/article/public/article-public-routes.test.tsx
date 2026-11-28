import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { PUBLIC_NAV } from '../../../router/public-nav';
import { emptyPublicHomeResponse } from '../../../test/empty-public-home-response';
import { fakeMatchMedia } from '../../../test/fake-match-media';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { ARTICLE_LIST_PATH, ARTICLE_PUBLIC_ROUTES } from '../index';
import {
  makePublicItem,
  makePublicPage,
  toPublicDetail,
  makePublished,
} from '../testing/article-fixtures';

// article F2, ABG-01 (menu) và phần ghép route: `ARTICLE_PUBLIC_ROUTES` nằm TRONG khung `PublicLayout` ở `router/routes.tsx` (có header, footer công khai), qua lớp HTTP thật với `fetch` giả
// đúng hợp đồng B2. Menu "Cẩm nang" (đầu trang) và "Cẩm nang sức khỏe" (chân trang) là liên kết `/cam-nang`; "Liên hệ" vẫn vô hiệu.
const fetchMock = vi.fn<typeof fetch>();
const DETAIL = toPublicDetail(
  makePublished({
    baiVietId: '12',
    tieuDe: 'Sốt xuất huyết',
    noiDung: 'Nội dung.',
  }),
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  resetAuthForTest();
  setAuthState({ status: 'unauthenticated' });
  window.localStorage.clear();
  // Điều hướng đầy đủ chỉ dựng từ 1280 px (search F14)
  fakeMatchMedia(1280);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/public/articles') {
      return json(
        makePublicPage([makePublicItem({ baiVietId: '3', tieuDe: 'Bài ba' })]),
      );
    }
    if (url.pathname === '/api/public/articles/12') return json(DETAIL);
    if (url.pathname === '/api/public/article-tags') return json({ items: [] });
    if (url.pathname.startsWith('/api/public/')) {
      return emptyPublicHomeResponse(String(input)) ?? json({ items: [] });
    }
    throw new Error(`lời gọi ngoài /api/public/: ${String(input)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  resetAuthForTest();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('menu công khai (ABG-01)', () => {
  it('ABG-01 cấu hình menu: "Cẩm nang" (đầu trang) và "Cẩm nang sức khỏe" (chân trang) có `to` là `/cam-nang`; "Liên hệ" vẫn không có `to`', () => {
    expect(ARTICLE_LIST_PATH).toBe('/cam-nang');
    expect(
      PUBLIC_NAV.navItems.find((item) => item.label === 'Cẩm nang')?.to,
    ).toBe('/cam-nang');
    expect(
      PUBLIC_NAV.footerLinks.find((item) => item.label === 'Cẩm nang sức khỏe')
        ?.to,
    ).toBe('/cam-nang');
    expect(
      PUBLIC_NAV.navItems.find((item) => item.label === 'Liên hệ')?.to,
    ).toBeUndefined();
  });

  it('ABG-01 khi hiển thị: header có liên kết "Cẩm nang" ⇒ /cam-nang, chân trang có "Cẩm nang sức khỏe" ⇒ /cam-nang; "Liên hệ" là nút vô hiệu', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1, name: /Đặt lịch khám/ });

    const nav = within(
      screen.getByRole('navigation', { name: 'Điều hướng chính' }),
    );
    expect(nav.getByRole('link', { name: 'Cẩm nang' })).toHaveAttribute(
      'href',
      '/cam-nang',
    );
    expect(nav.queryByRole('button', { name: /Cẩm nang/ })).toBeNull();
    expect(nav.getByRole('button', { name: /Liên hệ/ })).toBeDisabled();

    const footer = within(screen.getByRole('contentinfo'));
    expect(
      footer.getByRole('link', { name: 'Cẩm nang sức khỏe' }),
    ).toHaveAttribute('href', '/cam-nang');
  });
});

describe('route công khai trong khung PublicLayout (ABG-01, ABG-05, ABG-06)', () => {
  it('ABG-01 bộ route: hai route `cam-nang` và `cam-nang/:idSlug`, đều `lazy`', () => {
    expect(ARTICLE_PUBLIC_ROUTES.map((route) => route.path)).toEqual([
      'cam-nang',
      'cam-nang/:idSlug',
    ]);
    for (const route of ARTICLE_PUBLIC_ROUTES) {
      expect(typeof route.lazy).toBe('function');
    }
  });

  it('ABG-01 `/cam-nang` có header và footer công khai và hiện danh sách; "Cẩm nang" sáng (aria-current) ở menu', async () => {
    renderAt('/cam-nang');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Cẩm nang sức khỏe',
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Bài ba' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    const nav = within(
      screen.getByRole('navigation', { name: 'Điều hướng chính' }),
    );
    expect(nav.getByRole('link', { name: 'Cẩm nang' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('ABG-05 `/cam-nang/12-sot-xuat-huyet` trong khung công khai; không gửi Authorization ở mọi lời gọi công khai', async () => {
    renderAt('/cam-nang/12-sot-xuat-huyet');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sốt xuất huyết' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBeNull();
    }
  });

  it('ABG-06 `/cam-nang/12` chuyển hướng về đường chuẩn; `/cam-nang/abc` ra trang 404 CÓ khung công khai và không gọi API bài viết', async () => {
    const router = renderAt('/cam-nang/12');
    await screen.findByRole('heading', { level: 1, name: 'Sốt xuất huyết' });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/cam-nang/12-sot-xuat-huyet',
      ),
    );
    expect(router.state.historyAction).toBe('REPLACE');

    const bad = renderAt('/cam-nang/abc');
    expect(
      (await screen.findAllByRole('heading', { name: 'Không tìm thấy trang' }))
        .length,
    ).toBeGreaterThan(0);
    expect(bad.state.location.pathname).toBe('/cam-nang/abc');
    const articleCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/public/articles/abc'),
    );
    expect(articleCalls).toHaveLength(0);
  });

  it('ABG-10 trang chủ qua `createAppRoutes()` ⇒ khối "Cẩm nang sức khỏe" xuất hiện khi API có bài, với liên kết "Xem tất cả" ⇒ /cam-nang', async () => {
    renderAt('/');
    const region = await screen.findByRole('region', {
      name: 'Cẩm nang sức khỏe',
    });
    expect(
      within(region).getByRole('link', { name: 'Xem tất cả' }),
    ).toHaveAttribute('href', '/cam-nang');
    expect(
      within(region).getByRole('link', { name: 'Bài ba' }),
    ).toBeInTheDocument();
  });
});
