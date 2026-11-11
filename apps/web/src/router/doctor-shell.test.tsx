import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import {
  ROLE_HOME_PATHS,
  ROLE_LABELS,
  type AuthUser,
  type VaiTro,
} from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import { DOCTOR_PATHS } from '../features/doctor';
import { apiError, createFakeAuthApi } from '../test/fake-auth-api';
import { fakeMatchMedia } from '../test/fake-match-media';
import { createAppRoutes } from './routes';

// doctor F1: khung Bác sĩ ghép vào router thật (WK-01…WK-07, PLAN doctor mục 7).
const DOCTOR_MENU = [
  'Tổng quan',
  'Lịch hẹn',
  'Lịch làm việc',
  'Tin nhắn',
  'Thông báo',
  'Thông tin cá nhân',
];

let api: ReturnType<typeof createFakeAuthApi>;

function signedInAs(vaiTro: VaiTro) {
  const user: AuthUser = {
    vaiTro,
    hoTen: `Họ tên ${vaiTro}`,
    daXacMinhEmail: true,
  };
  setAuthState({ status: 'authenticated', user });
}

function renderAt(path: string, routes: RouteObject[] = createAppRoutes()) {
  const router = createMemoryRouter(routes, {
    initialEntries: ['/', path],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

const shell = () =>
  screen.findByRole('complementary', { name: 'Điều hướng Bác sĩ' });
const logoutButtons = () =>
  screen.getAllByRole('button', { name: 'Đăng xuất' });
const menuLabels = (container: HTMLElement) =>
  within(within(container).getByRole('navigation', { name: 'Menu chính' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent?.replace(' (chưa được triển khai)', ''));

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi();
  // Trang Lịch làm việc gọi GET /api/doctor/schedule: trả tuần trống để trang tải xong, mọi đường dẫn khác chuyển cho fake auth
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith('/api/doctor/schedule')
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                tuNgay: '',
                denNgay: '',
                ca: [],
                chiNhanhLoc: [],
              }),
              { headers: { 'Content-Type': 'application/json' } },
            ),
          )
        : api.fetch(input, init),
    ),
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

describe('khung Bác sĩ', () => {
  it('WK-01 WK-03 BS vào /bac-si-portal: chuyển tới Lịch làm việc bằng replace, menu đúng thứ tự Figma, họ tên + "Bác sĩ", không có "Về trang chủ"', async () => {
    signedInAs('BacSi');
    const router = renderAt(ROLE_HOME_PATHS.BacSi);

    expect(
      await screen.findByRole('heading', { name: 'Lịch làm việc' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(DOCTOR_PATHS.schedule);
    expect(router.state.historyAction).toBe('REPLACE');

    const aside = await shell();
    expect(within(aside).getByText('Họ tên BacSi')).toBeInTheDocument();
    expect(within(aside).getByText(ROLE_LABELS.BacSi)).toBeInTheDocument();
    expect(menuLabels(aside)).toEqual(DOCTOR_MENU);
    const link = within(aside).getByRole('link', { name: 'Lịch làm việc' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveAttribute('href', DOCTOR_PATHS.schedule);
    expect(
      within(aside).queryByRole('link', { name: 'Về trang chủ' }),
    ).toBeNull();
    expect(logoutButtons()).toHaveLength(2);
  });

  it('WK-02 mục chưa có trang là nút vô hiệu (chỉ "Lịch làm việc" là liên kết)', async () => {
    signedInAs('BacSi');
    renderAt(DOCTOR_PATHS.schedule);
    const aside = await shell();
    const menu = within(aside).getByRole('navigation', { name: 'Menu chính' });
    expect(within(menu).getAllByRole('link')).toHaveLength(1);
    const buttons = within(menu).getAllByRole('button');
    expect(buttons).toHaveLength(5);
    for (const button of buttons) expect(button).toBeDisabled();
  });

  it.each(['BenhNhan', 'LeTan', 'QuanTriVien'] as const)(
    'WK-04 %s mở /bac-si-portal: 404, không thấy khung Bác sĩ',
    async (vaiTro) => {
      signedInAs(vaiTro);
      renderAt(ROLE_HOME_PATHS.BacSi);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Bác sĩ' }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    },
  );

  it('WK-04b khách mở /bac-si-portal/lich-lam-viec: về /dang-nhap, không lộ khung', async () => {
    setAuthState({ status: 'unauthenticated', user: null });
    const router = renderAt(DOCTOR_PATHS.schedule);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('WK-05 /auth/logout 500: câu lỗi + "Thử lại", vẫn ở khung; Thử lại gửi request thứ hai và về đăng nhập', async () => {
    signedInAs('BacSi');
    api.failNext('/auth/logout', () => apiError(500, 'LOI_HE_THONG'));
    const router = renderAt(DOCTOR_PATHS.schedule);
    await shell();

    fireEvent.click(logoutButtons()[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không đăng xuất được, vui lòng thử lại',
    );
    expect(router.state.location.pathname).toBe(DOCTOR_PATHS.schedule);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(api.logoutCalls).toBe(2);
  });

  it('WK-06 390px: không có thanh bên, "Mở menu" mở ngăn kéo "Điều hướng Bác sĩ" đủ 6 mục', async () => {
    fakeMatchMedia(390);
    signedInAs('BacSi');
    renderAt(DOCTOR_PATHS.schedule);
    await screen.findByRole('heading', { name: 'Lịch làm việc' });
    expect(screen.queryByRole('complementary')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Điều hướng Bác sĩ',
    });
    expect(menuLabels(dialog)).toEqual(DOCTOR_MENU);

    fireEvent.click(
      within(dialog).getByRole('link', { name: 'Lịch làm việc' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('WK-07 trang con ném lỗi: khung và nút Đăng xuất còn, lỗi trong vùng nội dung, không lộ chi tiết', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    signedInAs('BacSi');
    function Broken(): never {
      throw new Error('chi tiết nội bộ');
    }
    const routes = createAppRoutes();
    // Gắn trang hỏng vào đúng chỗ module khác cắm trang Bác sĩ (mảng con của route bọc lỗi, cạnh DOCTOR_ROUTES)
    const doctorRoute = routes[0].children
      ?.flatMap((route) => route.children ?? [])
      .find((route) => route.path === ROLE_HOME_PATHS.BacSi);
    const pages = doctorRoute?.children?.[0].children;
    pages?.push({ path: 'hong', element: <Broken /> });
    onTestFinished(() => void pages?.pop());
    renderAt(`${ROLE_HOME_PATHS.BacSi}/hong`, routes);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra');
    expect(screen.queryByText(/chi tiết nội bộ/)).toBeNull();
    const aside = await shell();
    expect(screen.getByRole('main')).toContainElement(alert);
    expect(aside).not.toContainElement(alert);
    expect(logoutButtons()).toHaveLength(2);
  });
});
