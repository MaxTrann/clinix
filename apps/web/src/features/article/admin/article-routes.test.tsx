import { isValidElement, type ReactElement } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { createFakeAuthApi } from '../../../test/fake-auth-api';
import { AdminScopeGuard, type AdminMe } from '../../admin';
import { resetAuthForTest, restoreSession } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { ROLE_HOME_PATHS } from '../../auth';
import { ARTICLE_ADMIN_PATH } from '../common/article-paths';
import { makeListItem, makeListPage } from '../testing/article-fixtures';
import { ARTICLE_ADMIN_ROUTES } from './article-routes';

// article F1, ABW-01: mục "Bài viết" ở thanh bên chỉ có với Toàn hệ thống; Chi nhánh gõ đường dẫn thì nhận trang "Không đủ quyền truy cập" và KHÔNG gọi API bài viết.
// Cấu trúc route kiểm trực tiếp; hành vi qua app thật (`createAppRoutes`) với `fetch` giả. Nếp `reviews-routes.test.tsx` (doctor-exam F7). Dữ liệu giả.
const TOAN_HE_THONG: AdminMe = { phamVi: 'ToanHeThong' };
const CHI_NHANH: AdminMe = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '1', ten: 'CLINIX Chi nhánh Quận 3' },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let api: ReturnType<typeof createFakeAuthApi>;

async function renderApp(
  path: string,
  options: { scope?: AdminMe; vaiTro?: string } = {},
) {
  resetAuthForTest();
  api = createFakeAuthApi({
    vaiTro: options.vaiTro ?? 'QuanTriVien',
    hoTen: 'Admin CLINIX',
    daXacMinhEmail: true,
  });
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  api.startSession();
  await restoreSession();
  api.failNext('/admin/me', () => json(options.scope ?? TOAN_HE_THONG));
  // một danh sách bài viết cho mọi lần gọi (mỗi override dùng một lần)
  for (let index = 0; index < 4; index += 1) {
    api.failNext('/admin/articles', () =>
      json(
        makeListPage([
          makeListItem({ baiVietId: '1', tieuDe: 'Bài trong app thật' }),
        ]),
      ),
    );
  }
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const articleCalls = () =>
  api.requests.filter((request) => request.path.startsWith('/admin/articles'));
const sidebar = () =>
  screen.findByRole('complementary', { name: 'Điều hướng Admin' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('route quản trị bài viết (ABW-01)', () => {
  it('ABW-01 đường dẫn nằm dưới gốc khu Quản trị viên và khớp chữ ghi ở thanh bên', () => {
    expect(ARTICLE_ADMIN_PATH).toBe('/admin/bai-viet');
    expect(ARTICLE_ADMIN_PATH).toBe(`${ROLE_HOME_PATHS.QuanTriVien}/bai-viet`);
  });

  it('ABW-01 cấu trúc: một nhóm bọc `AdminScopeGuard policy="ToanHeThong"` với ba route con (danh sách, tạo, sửa), "moi" đứng trước ":id"', () => {
    expect(ARTICLE_ADMIN_ROUTES).toHaveLength(1);
    const [route] = ARTICLE_ADMIN_ROUTES;
    expect(isValidElement(route.element)).toBe(true);
    const guard = route.element as ReactElement<{ policy: string }>;
    expect(guard.type).toBe(AdminScopeGuard);
    expect(guard.props.policy).toBe('ToanHeThong');
    expect(route.children?.map((child) => child.path)).toEqual([
      'bai-viet',
      'bai-viet/moi',
      'bai-viet/:id',
    ]);
    for (const child of route.children ?? []) {
      expect(typeof child.lazy).toBe('function');
    }
  });

  it('ABW-01 Toàn hệ thống: thanh bên có liên kết "Bài viết" tới đúng đường dẫn, đứng ngay trên "Kiểm duyệt đánh giá"; mở trang thấy bảng', async () => {
    await renderApp('/admin/bai-viet');

    const nav = within(await sidebar());
    const link = nav.getByRole('link', { name: 'Bài viết' });
    expect(link).toHaveAttribute('href', ARTICLE_ADMIN_PATH);
    expect(
      await screen.findByRole('table', { name: 'Danh sách bài viết' }),
    ).toBeVisible();
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Bài viết' }),
    ).toBeVisible();
    const group = nav
      .getByRole('heading', { name: 'Nội dung' })
      .closest('section') as HTMLElement;
    expect(
      within(group)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
        .slice(0, 2),
    ).toEqual(['Bài viết', 'Kiểm duyệt đánh giá']);
  });

  it('ABW-01 mục "Bài viết" vẫn sáng ở trang tạo và trang sửa (đường dẫn con)', async () => {
    await renderApp('/admin/bai-viet/moi');

    const link = within(await sidebar()).getByRole('link', {
      name: 'Bài viết',
    });
    expect(
      await screen.findByRole('heading', { name: 'Viết bài mới' }),
    ).toBeVisible();
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(articleCalls()).toHaveLength(0);
  });

  it('ABW-01 từ trang tổng quan bấm "Bài viết" ⇒ chuyển trang (không tải lại cả app)', async () => {
    const router = await renderApp(ROLE_HOME_PATHS.QuanTriVien);
    const link = within(await sidebar()).getByRole('link', {
      name: 'Bài viết',
    });
    expect(link).not.toHaveAttribute('aria-current');

    fireEvent.click(link);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ARTICLE_ADMIN_PATH),
    );
    expect(
      await screen.findByRole('table', { name: 'Danh sách bài viết' }),
    ).toBeVisible();
  });

  it('ABW-01 Chi nhánh: thanh bên KHÔNG có mục "Bài viết"', async () => {
    await renderApp('/admin', { scope: CHI_NHANH });

    const nav = within(await sidebar());
    expect(await nav.findByText('Nhật ký hành động')).toBeVisible();
    expect(nav.queryByText('Bài viết')).toBeNull();
    expect(nav.queryByRole('link', { name: 'Bài viết' })).toBeNull();
  });

  it.each(['/admin/bai-viet', '/admin/bai-viet/moi', '/admin/bai-viet/5'])(
    'ABW-01 Chi nhánh gõ thẳng %s ⇒ trang "Không đủ quyền truy cập", KHÔNG gọi API bài viết, không lộ biểu mẫu',
    async (path) => {
      await renderApp(path, { scope: CHI_NHANH });

      expect(
        await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('table', { name: 'Danh sách bài viết' }),
      ).toBeNull();
      expect(screen.queryByLabelText('Tiêu đề')).toBeNull();
      expect(articleCalls()).toHaveLength(0);
    },
  );

  it.each(['BenhNhan', 'BacSi', 'LeTan'])(
    'ABW-01 vai trò %s mở /admin/bai-viet ⇒ không thấy trang, không gọi API bài viết',
    async (vaiTro) => {
      await renderApp('/admin/bai-viet', { vaiTro });

      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('table', { name: 'Danh sách bài viết' }),
      ).toBeNull();
      expect(articleCalls()).toHaveLength(0);
    },
  );

  it('ABW-01 khách chưa đăng nhập bị đưa tới trang đăng nhập, không gọi API bài viết', async () => {
    resetAuthForTest();
    api = createFakeAuthApi();
    vi.stubGlobal('fetch', vi.fn(api.fetch));
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined,
    });
    setAuthState({ status: 'unauthenticated' });
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: ['/admin/bai-viet'],
    });
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { name: 'Đăng nhập' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/dang-nhap');
    expect(articleCalls()).toHaveLength(0);
  });
});
