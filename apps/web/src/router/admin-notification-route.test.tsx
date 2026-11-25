import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import {
  resetAuthForTest,
  restoreSession,
} from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import { AdminHeader } from '../features/admin/components/admin-header';
import { ADMIN_NOTIFICATIONS_PATH } from '../shared/routes/notification-paths';
import { createFakeAuthApi } from '../test/fake-auth-api';
import { createAppRoutes } from './routes';

// notification F3 `[ĐỤNG admin]`: chuông và mục "Thông báo" của khung Quản trị viên qua router thật (WTB-15, phần Admin của WTB-05). Đăng nhập bằng phiên giả
// như `features/admin/admin-layout.test.tsx` (GET /admin/me cần token). Số chưa đọc lấy từ `unreadCount` của fake auth; danh sách trả trang rỗng. Mã ca ANR-nn là [đề xuất].
const SCOPES = [
  ['Toàn hệ thống', { phamVi: 'ToanHeThong' }],
  [
    'Chi nhánh',
    {
      phamVi: 'ChiNhanh',
      chiNhanh: { id: 'branch-1', ten: 'Phòng khám Quận 1' },
    },
  ],
] as const;

let api: ReturnType<typeof createFakeAuthApi>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

async function signInAsAdmin(me: unknown) {
  api.startSession();
  await restoreSession();
  api.failNext('/admin/me', () => json(me));
}

const unreadCalls = () =>
  api.requests.filter(({ path }) => path === '/notifications/unread-count');

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi({
    vaiTro: 'QuanTriVien',
    hoTen: 'Quản trị mẫu',
    daXacMinhEmail: true,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).split('?')[0] === '/api/notifications')
        return json({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
          soChuaDoc: api.unreadCount,
        });
      return api.fetch(input, init);
    }),
  );
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('khung Quản trị viên: chuông và mục "Thông báo" (WTB-15)', () => {
  it.each(SCOPES)(
    'WTB-15 ANR-01 phạm vi %s mở /admin/thong-bao: trang Thông báo trong khung; chuông hết `disabled`, là liên kết có số; mục menu có `to`, sáng, có số; MỘT lời gọi số chưa đọc',
    async (_label, me) => {
      api.unreadCount = 120;
      await signInAsAdmin(me);
      const router = renderAt(ADMIN_NOTIFICATIONS_PATH);

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Thông báo' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(ADMIN_NOTIFICATIONS_PATH);
      const banner = screen.getByRole('banner');
      const bell = await within(banner).findByRole('link', {
        name: 'Thông báo, 120 chưa đọc',
      });
      expect(bell).toHaveAttribute('href', ADMIN_NOTIFICATIONS_PATH);
      expect(bell).toHaveTextContent('99+');
      // Không còn nút chuông vô hiệu
      expect(
        within(banner).queryByRole('button', { name: 'Thông báo' }),
      ).toBeNull();
      const navigation = screen.getByRole('navigation', {
        name: 'Điều hướng Admin',
      });
      const item = within(navigation).getByRole('link', {
        name: 'Thông báo, 120 chưa đọc',
      });
      expect(item).toHaveAttribute('href', ADMIN_NOTIFICATIONS_PATH);
      expect(item).toHaveAttribute('aria-current', 'page');
      expect(item).toHaveTextContent('99+');
      expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
      expect(unreadCalls()).toHaveLength(1);
    },
  );

  it('WTB-15 ANR-02 số 0: chuông vẫn là liên kết nhưng không chữ số; mục menu không có số', async () => {
    await signInAsAdmin({ phamVi: 'ToanHeThong' });
    renderAt('/admin');
    const bell = await within(await screen.findByRole('banner')).findByRole(
      'link',
      { name: 'Thông báo, 0 chưa đọc' },
    );
    expect(bell.textContent).toBe('');
    const navigation = screen.getByRole('navigation', {
      name: 'Điều hướng Admin',
    });
    const item = within(navigation).getByRole('link', { name: 'Thông báo' });
    expect(item).toHaveTextContent(/^Thông báo$/);
    expect(item).not.toHaveAttribute('aria-current');
  });

  it.each(['BenhNhan', 'LeTan', 'BacSi'] as const)(
    'WTB-15 ANR-03 %s mở /admin/thong-bao: 404, không khung Admin',
    async (vaiTro) => {
      setAuthState({
        status: 'authenticated',
        user: { vaiTro, hoTen: 'x', daXacMinhEmail: true },
      });
      renderAt(ADMIN_NOTIFICATIONS_PATH);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: 'Điều hướng Admin' }),
      ).toBeNull();
    },
  );

  it('WTB-15 ANR-04 `AdminHeader` không nhận `notifications` ⇒ giữ nút chuông vô hiệu như admin F1 (nơi dùng cũ không đổi)', () => {
    render(<AdminHeader onLogout={vi.fn()} logoutPending={false} />);
    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeDisabled();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('[aria-live]')).toBeNull();
  });
});
