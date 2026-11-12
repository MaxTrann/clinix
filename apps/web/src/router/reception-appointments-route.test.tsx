import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { AuthUser, VaiTro } from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import { createFakeReceptionApi } from '../features/booking/testing/fake-reception-api';
import { createFakeAuthApi } from '../test/fake-auth-api';
import { RECEPTION_APPOINTMENTS_PATH } from '../shared/routes/booking-paths';
import { createAppRoutes } from './routes';

// booking F8 `[ĐỤNG router]`: trang "Quản lý lịch hẹn" ghép vào khung Lễ tân của router thật (LTC-09; đúng/sai vai trò theo AGENTS mục 4). Mã LTC là [đề xuất] (PLAN booking
// mục 7.34). API giả CHỈ cho hai route của Lễ tân và hai route công khai; mọi đường dẫn khác chuyển cho fake auth.
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
    initialEntries: ['/', path],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  resetAuthForTest();
  const auth = createFakeAuthApi();
  const reception = createFakeReceptionApi(auth.fetch);
  vi.stubGlobal('fetch', vi.fn(reception.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('route "Quản lý lịch hẹn" của Lễ tân (F8)', () => {
  it('LTC-09 Lễ tân mở /le-tan/quan-ly-lich-hen: trang trong khung Lễ tân, mục menu sáng, trỏ đúng đường dẫn, bảng có dữ liệu', async () => {
    signedInAs('LeTan');
    const router = renderAt(RECEPTION_APPOINTMENTS_PATH);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Quản lý lịch hẹn',
      }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/le-tan/quan-ly-lich-hen');

    const aside = screen.getByRole('complementary', {
      name: 'Điều hướng Lễ tân',
    });
    const link = within(aside).getByRole('link', { name: 'Quản lý lịch hẹn' });
    expect(link).toHaveAttribute('href', RECEPTION_APPOINTMENTS_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
    // Trang thật chạy qua `lazy` và gọi đúng route của Lễ tân (một dòng mặc định của API giả)
    expect(await screen.findByText('CP20261018001')).toBeInTheDocument();
  });

  it.each(['BenhNhan', 'BacSi', 'QuanTriVien'] as const)(
    'LTC-09 %s mở /le-tan/quan-ly-lich-hen: 404, không thấy trang lẫn khung Lễ tân, không gọi route của Lễ tân',
    async (vaiTro) => {
      signedInAs(vaiTro);
      renderAt(RECEPTION_APPOINTMENTS_PATH);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('heading', { level: 1, name: 'Quản lý lịch hẹn' }),
      ).toBeNull();
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Lễ tân' }),
      ).toBeNull();
      const calls = vi
        .mocked(fetch)
        .mock.calls.map(([input]) => String(input))
        .filter((url) => url.includes('/reception/appointments'));
      expect(calls).toEqual([]);
    },
  );

  it('LTC-09 khách mở đường dẫn: về /dang-nhap, không lộ trang', async () => {
    setAuthState({ status: 'unauthenticated', user: null });
    const router = renderAt(RECEPTION_APPOINTMENTS_PATH);
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Quản lý lịch hẹn' }),
    ).toBeNull();
  });
});
