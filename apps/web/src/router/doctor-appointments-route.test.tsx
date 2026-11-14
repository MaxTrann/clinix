import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { setApiAuthHooks } from '../shared/api/auth-hooks';
import type { AuthUser, VaiTro } from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import { createFakeDoctorApi } from '../features/booking/testing/fake-doctor-api';
import { createFakeAuthApi } from '../test/fake-auth-api';
import {
  DOCTOR_APPOINTMENTS_PATH,
  doctorAppointmentDetailPath,
} from '../shared/routes/booking-paths';
import { createAppRoutes } from './routes';

// booking F11 `[ĐỤNG router]`: trang "Lịch hẹn" của Bác sĩ ghép vào khung Bác sĩ của router thật (DAR-01…DAR-06; đúng/sai vai trò theo AGENTS mục 4). Cũng là phần của WK-08 của doctor ("gắn route Lịch hẹn của
// booking: có mặt khi có"). Mã DAR là [đề xuất] (PLAN booking mục 7.44). API giả CHỈ cho hai route của Bác sĩ; mọi đường dẫn khác chuyển cho fake auth.
let doctor: ReturnType<typeof createFakeDoctorApi>;

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

const DETAIL_PATH = doctorAppointmentDetailPath('CP20261018001');
const shell = () =>
  screen.findByRole('complementary', { name: 'Điều hướng Bác sĩ' });
const calledDoctorApi = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([input]) => String(input))
    .filter((url) => url.includes('/doctor/appointments'));

beforeEach(() => {
  resetAuthForTest();
  const auth = createFakeAuthApi();
  doctor = createFakeDoctorApi(auth.fetch);
  vi.stubGlobal('fetch', vi.fn(doctor.fetch));
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('route "Lịch hẹn" của Bác sĩ (F11)', () => {
  it('DAR-01 Bác sĩ mở /bac-si-portal/lich-hen: trang trong khung Bác sĩ, mục menu `Lịch hẹn` là liên kết sáng đúng `href` (khớp hằng ở shared/), bảng có dữ liệu, route gắn token', async () => {
    signedInAs('BacSi');
    const router = renderAt(DOCTOR_APPOINTMENTS_PATH);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lịch hẹn' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/bac-si-portal/lich-hen');

    const link = within(await shell()).getByRole('link', { name: 'Lịch hẹn' });
    expect(link).toHaveAttribute('href', DOCTOR_APPOINTMENTS_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
    // Trang thật chạy qua `lazy` và gọi đúng route của Bác sĩ (một dòng mặc định của API giả)
    expect(await screen.findByText('CP20261018001')).toBeInTheDocument();
    expect(doctor.callsTo('/doctor/appointments')[0].hasToken).toBe(true);
    expect(doctor.writes()).toEqual([]);
  });

  it('DAR-02 Bác sĩ mở thẳng chi tiết /bac-si-portal/lich-hen/:ma: trang chi tiết trong khung Bác sĩ, mục menu `Lịch hẹn` vẫn sáng (mục cha)', async () => {
    signedInAs('BacSi');
    renderAt(DETAIL_PATH);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Chi tiết ca khám',
      }),
    ).toBeVisible();
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Thông tin lịch hẹn',
      }),
    ).toBeVisible();
    const link = within(await shell()).getByRole('link', { name: 'Lịch hẹn' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(doctor.callsTo('/doctor/appointments/CP20261018001')).toHaveLength(
      1,
    );
  });

  it.each(['BenhNhan', 'LeTan', 'QuanTriVien'] as const)(
    'DAR-03 %s mở đường dẫn danh sách và chi tiết của Bác sĩ: 404, không thấy trang lẫn khung Bác sĩ, không gọi route của Bác sĩ',
    async (vaiTro) => {
      for (const path of [DOCTOR_APPOINTMENTS_PATH, DETAIL_PATH]) {
        signedInAs(vaiTro);
        const { unmount } = render(
          <RouterProvider
            router={createMemoryRouter(createAppRoutes(), {
              initialEntries: ['/', path],
              initialIndex: 1,
            })}
          />,
        );
        expect(
          await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
        ).toBeVisible();
        expect(
          screen.queryByRole('heading', { level: 1, name: 'Lịch hẹn' }),
        ).toBeNull();
        expect(
          screen.queryByRole('heading', { level: 1, name: 'Chi tiết ca khám' }),
        ).toBeNull();
        expect(
          screen.queryByRole('complementary', { name: 'Điều hướng Bác sĩ' }),
        ).toBeNull();
        expect(calledDoctorApi()).toEqual([]);
        unmount();
      }
    },
  );

  it('DAR-04 khách mở danh sách hay chi tiết: về /dang-nhap, không lộ trang, không gọi route của Bác sĩ', async () => {
    for (const path of [DOCTOR_APPOINTMENTS_PATH, DETAIL_PATH]) {
      setAuthState({ status: 'unauthenticated', user: null });
      const router = createMemoryRouter(createAppRoutes(), {
        initialEntries: ['/', path],
        initialIndex: 1,
      });
      const { unmount } = render(<RouterProvider router={router} />);
      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe('/dang-nhap'),
      );
      expect(
        screen.queryByRole('heading', { level: 1, name: 'Lịch hẹn' }),
      ).toBeNull();
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(calledDoctorApi()).toEqual([]);
      unmount();
    }
  });

  it('DAR-05 `Chi tiết` rồi `← Lịch hẹn` trong router thật: bộ lọc của danh sách được giữ (trên URL, không có `q`)', async () => {
    signedInAs('BacSi');
    const router = renderAt(
      `${DOCTOR_APPOINTMENTS_PATH}?trangThai=DaXacNhan&ca=CaSang`,
    );
    fireEvent.click(
      await screen.findByRole('link', {
        name: 'Chi tiết lịch hẹn CP20261018001',
      }),
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Chi tiết ca khám',
      }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(
      '/bac-si-portal/lich-hen/CP20261018001',
    );

    fireEvent.click(
      within(screen.getByRole('main')).getByRole('link', { name: 'Lịch hẹn' }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lịch hẹn' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/bac-si-portal/lich-hen');
    expect(router.state.location.search).toBe('?trangThai=DaXacNhan&ca=CaSang');
    expect(
      screen.getByRole('button', { name: /^Đã xác nhận/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('DAR-06 menu Bác sĩ vẫn đủ sáu mục đúng thứ tự Figma; đúng hai liên kết (`Lịch hẹn`, `Lịch làm việc`) và bốn nút vô hiệu (cặp với WK-02)', async () => {
    signedInAs('BacSi');
    renderAt(DOCTOR_APPOINTMENTS_PATH);
    const menu = within(await shell()).getByRole('navigation', {
      name: 'Menu chính',
    });
    expect(
      within(menu)
        .getAllByRole('listitem')
        .map((item) =>
          item.textContent?.replace(' (chưa được triển khai)', ''),
        ),
    ).toEqual([
      'Tổng quan',
      'Lịch hẹn',
      'Lịch làm việc',
      'Tin nhắn',
      'Thông báo',
      'Thông tin cá nhân',
    ]);
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Lịch hẹn', 'Lịch làm việc']);
    const buttons = within(menu).getAllByRole('button');
    expect(buttons).toHaveLength(4);
    for (const button of buttons) expect(button).toBeDisabled();
  });
});
