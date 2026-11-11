import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { AuthUser, VaiTro } from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import { RECEPTION_SCHEDULE_PATH } from '../features/doctor';
import { jsonResponse } from '../features/doctor/testing/fetch-routing';
import { createFakeAuthApi } from '../test/fake-auth-api';
import { createAppRoutes } from './routes';

// doctor F5: trang "Lịch làm việc bác sĩ" ghép vào khung Lễ tân của router thật (WL-08, WL-09; đúng/sai vai trò theo AGENTS mục 4).
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
  const api = createFakeAuthApi();
  // Trang gọi ba đường dẫn của Lễ tân; mọi đường dẫn khác chuyển cho fake auth
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('?')[0];
      if (path.endsWith('/reception/doctor-schedules/doctors'))
        return Promise.resolve(
          jsonResponse({ items: [], total: 0, page: 1, pageSize: 100 }),
        );
      if (path.endsWith('/reception/doctor-schedules'))
        return Promise.resolve(
          jsonResponse({
            tuNgay: '',
            denNgay: '',
            items: [],
            total: 0,
            page: 1,
            pageSize: 50,
          }),
        );
      if (path.endsWith('/profile'))
        return Promise.resolve(
          jsonResponse({
            chiNhanh: { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' },
          }),
        );
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

describe('route Lịch làm việc bác sĩ của Lễ tân (F5)', () => {
  it('WL-08 Lễ tân mở /le-tan/lich-lam-viec-bac-si: trang trong khung Lễ tân, mục menu sáng, trỏ đúng đường dẫn', async () => {
    signedInAs('LeTan');
    const router = renderAt(RECEPTION_SCHEDULE_PATH);
    expect(
      await screen.findByRole('heading', { name: 'Lịch làm việc bác sĩ' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/le-tan/lich-lam-viec-bac-si');
    const aside = screen.getByRole('complementary', {
      name: 'Điều hướng Lễ tân',
    });
    const link = within(aside).getByRole('link', {
      name: 'Lịch làm việc bác sĩ',
    });
    expect(link).toHaveAttribute('href', RECEPTION_SCHEDULE_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it.each(['BenhNhan', 'BacSi', 'QuanTriVien'] as const)(
    'WL-09 %s mở /le-tan/lich-lam-viec-bac-si: 404, không thấy trang lẫn khung Lễ tân',
    async (vaiTro) => {
      signedInAs(vaiTro);
      renderAt(RECEPTION_SCHEDULE_PATH);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('heading', { name: 'Lịch làm việc bác sĩ' }),
      ).toBeNull();
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Lễ tân' }),
      ).toBeNull();
    },
  );

  it('WL-09 khách mở đường dẫn: về /dang-nhap, không lộ trang', async () => {
    setAuthState({ status: 'unauthenticated', user: null });
    const router = renderAt(RECEPTION_SCHEDULE_PATH);
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(
      screen.queryByRole('heading', { name: 'Lịch làm việc bác sĩ' }),
    ).toBeNull();
  });
});
