import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { type AuthUser, type VaiTro } from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import {
  DOCTOR_NOTIFICATIONS_PATH,
  PATIENT_NOTIFICATIONS_PATH,
  RECEPTION_NOTIFICATIONS_PATH,
} from '../shared/routes/notification-paths';
import { createFakeAuthApi } from '../test/fake-auth-api';
import { createAppRoutes } from './routes';

// notification F1 `[ĐỤNG router]`: chuông, số đếm và route "Thông báo" của ba khung qua router thật (WTB-01, WTB-05; đúng/sai vai trò theo AGENTS mục 4).
// Số chưa đọc lấy từ API giả (`unreadCount` của fake auth). Mã ca NSR-nn là [đề xuất].
const SHELLS = [
  ['BenhNhan', PATIENT_NOTIFICATIONS_PATH, 'Điều hướng Bệnh nhân'],
  ['LeTan', RECEPTION_NOTIFICATIONS_PATH, 'Điều hướng Lễ tân'],
  ['BacSi', DOCTOR_NOTIFICATIONS_PATH, 'Điều hướng Bác sĩ'],
] as const;

let api: ReturnType<typeof createFakeAuthApi>;

function signedInAs(vaiTro: VaiTro) {
  const user: AuthUser = {
    vaiTro,
    hoTen: `Họ tên ${vaiTro}`,
    daXacMinhEmail: true,
  };
  setAuthState({ status: 'authenticated', user });
}

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const unreadCalls = () =>
  api.requests.filter(({ path }) => path === '/notifications/unread-count');

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi();
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('chuông và mục "Thông báo" của ba khung', () => {
  it.each(SHELLS)(
    'WTB-01 WTB-05 NSR-01 %s mở %s: trang Thông báo trong khung; chuông là liên kết có số; mục menu có `to`, sáng, có số; MỘT lời gọi số chưa đọc',
    async (vaiTro, path, navLabel) => {
      api.unreadCount = 3;
      signedInAs(vaiTro);
      const router = renderAt(path);

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Thông báo' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(path);
      const bell = await within(screen.getByRole('banner')).findByRole('link', {
        name: 'Thông báo, 3 chưa đọc',
      });
      expect(bell).toHaveAttribute('href', path);
      const aside = screen.getByRole('complementary', { name: navLabel });
      const item = within(
        within(aside).getByRole('navigation', { name: 'Menu chính' }),
      ).getByRole('link', { name: 'Thông báo, 3 chưa đọc' });
      expect(item).toHaveAttribute('href', path);
      expect(item).toHaveAttribute('aria-current', 'page');
      expect(item).toHaveTextContent('3');
      // Trang (F1) đọc cùng kho với chuông
      expect(
        screen.getByText('Bạn có 3 thông báo chưa đọc.'),
      ).toBeInTheDocument();
      // Chuông, mục menu và trang dùng chung MỘT hook thăm dò (router gọi một lần cho khung)
      expect(unreadCalls()).toHaveLength(1);
    },
  );

  it('WTB-01 NSR-02 số 0: chuông vẫn có nhưng không chữ số; mục menu không có số', async () => {
    signedInAs('BenhNhan');
    renderAt(PATIENT_NOTIFICATIONS_PATH);
    await screen.findByRole('heading', { level: 1, name: 'Thông báo' });
    const bell = await within(screen.getByRole('banner')).findByRole('link', {
      name: 'Thông báo, 0 chưa đọc',
    });
    expect(bell.textContent).toBe('');
    expect(screen.getByRole('link', { name: 'Thông báo' })).toHaveTextContent(
      /^Thông báo$/,
    );
  });

  it.each([
    ['BenhNhan', RECEPTION_NOTIFICATIONS_PATH],
    ['BenhNhan', DOCTOR_NOTIFICATIONS_PATH],
    ['LeTan', PATIENT_NOTIFICATIONS_PATH],
    ['BacSi', RECEPTION_NOTIFICATIONS_PATH],
    ['QuanTriVien', PATIENT_NOTIFICATIONS_PATH],
  ] as const)(
    'WTB-05 NSR-03 %s mở %s (trang Thông báo của vai khác): 404, không khung, không thăm dò',
    async (vaiTro, path) => {
      signedInAs(vaiTro);
      renderAt(path);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /chưa đọc/ })).toBeNull();
      expect(unreadCalls()).toHaveLength(0);
    },
  );

  it('WTB-05 NSR-04 khách mở trang Thông báo: về /dang-nhap, không thăm dò số chưa đọc', async () => {
    setAuthState({ status: 'unauthenticated', user: null });
    const router = renderAt(PATIENT_NOTIFICATIONS_PATH);
    expect(
      await screen.findByRole('heading', { name: 'Đăng nhập' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dang-nhap');
    expect(unreadCalls()).toHaveLength(0);
  });
});
