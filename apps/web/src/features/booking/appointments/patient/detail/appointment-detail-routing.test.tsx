import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../../../router/routes';
import {
  PATIENT_APPOINTMENTS_PATH,
  patientAppointmentDetailPath,
} from '../../../../../shared/routes/booking-paths';
import { createFakeAuthApi } from '../../../../../test/fake-auth-api';
import { ROLE_HOME_PATHS, type AuthUser, type VaiTro } from '../../../../auth';
import { resetAuthForTest } from '../../../../auth/auth-session';
import { setAuthState } from '../../../../auth/auth-store';
import { createFakeAppointmentDetailApi } from '../../../testing/fake-appointment-detail-api';
import { DETAIL_TEXT } from './detail-messages';

// booking F2: trang chi tiết đi qua ứng dụng thật (`createAppRoutes`) với API giả. Route nằm trong mảng `PATIENT_APPOINTMENT_ROUTES` (không chạm `router/`). Mã LCT là
// [đề xuất] (PLAN booking mục 7.33 sau khi duyệt). LCT-07: đúng vai, sai vai, khách, mục menu, mã có ký tự đặc biệt.
let detail: ReturnType<typeof createFakeAppointmentDetailApi>;

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

const CODE = 'CP20261020001';
const DETAIL_PATH = patientAppointmentDetailPath(CODE);
const pageHeading = () =>
  screen.queryByRole('heading', { level: 1, name: DETAIL_TEXT.title });

beforeEach(() => {
  resetAuthForTest();
  const auth = createFakeAuthApi();
  detail = createFakeAppointmentDetailApi(auth.fetch);
  vi.stubGlobal('fetch', vi.fn(detail.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('route chi tiết lịch hẹn', () => {
  it('LCT-07 Bệnh nhân vào đường dẫn ⇒ trang nằm trong khung Bệnh nhân, mục "Lịch hẹn của tôi" có `href` về danh sách và `aria-current` (không `end`), có dữ liệu, đúng một GET', async () => {
    signedInAs('BenhNhan');
    const router = renderAt(DETAIL_PATH);

    const aside = await screen.findByRole('complementary', {
      name: 'Điều hướng Bệnh nhân',
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: DETAIL_TEXT.title }),
    ).toBeInTheDocument();
    const link = within(
      within(aside).getByRole('navigation', { name: 'Menu chính' }),
    ).getByRole('link', { name: 'Lịch hẹn của tôi' });
    expect(link).toHaveAttribute('href', PATIENT_APPOINTMENTS_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(router.state.location.pathname).toBe(DETAIL_PATH);
    expect(
      await screen.findByRole('region', { name: DETAIL_TEXT.summary }),
    ).toBeInTheDocument();
    expect(detail.callsTo('GET', `/patient/appointments/${CODE}`)).toHaveLength(
      1,
    );
    // Liên kết quay lại ở trang cũng trỏ về danh sách
    const main = screen.getByRole('main');
    expect(
      within(main).getByRole('link', { name: DETAIL_TEXT.backToList }),
    ).toHaveAttribute('href', PATIENT_APPOINTMENTS_PATH);
  });

  it('LCT-07 mã lịch hẹn có ký tự đặc biệt ⇒ URL mã hoá, trang giải mã đúng và gọi API với mã đã mã hoá (không thoát khỏi đoạn đường)', async () => {
    signedInAs('BenhNhan');
    const router = renderAt(patientAppointmentDetailPath('CP/1?x#y'));

    await screen.findByRole('region', { name: DETAIL_TEXT.summary });
    expect(router.state.location.pathname).toBe(
      '/benh-nhan/lich-hen-cua-toi/CP%2F1%3Fx%23y',
    );
    expect(detail.requests.map((request) => request.path)).toEqual([
      '/patient/appointments/CP%2F1%3Fx%23y',
    ]);
  });

  // Quyền thật do API kiểm; cổng ở giao diện chỉ để không hiện trang sai vai (PLAN 5.13). Sai vai hiện 404 như `RequireAuth` đã làm
  it.each(['LeTan', 'BacSi', 'QuanTriVien'] as const)(
    'LCT-07 %s mở đường dẫn của Bệnh nhân ⇒ 404, không thấy trang và không gọi API chi tiết',
    async (vaiTro) => {
      signedInAs(vaiTro);
      renderAt(DETAIL_PATH);

      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(pageHeading()).toBeNull();
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Bệnh nhân' }),
      ).toBeNull();
      expect(
        detail.requests.filter((request) =>
          request.path.startsWith('/patient/appointments'),
        ),
      ).toEqual([]);
      expect(ROLE_HOME_PATHS[vaiTro]).not.toBe(ROLE_HOME_PATHS.BenhNhan);
    },
  );

  it('LCT-07 khách chưa đăng nhập ⇒ về /dang-nhap bằng replace, không lộ trang, không gọi API chi tiết', async () => {
    setAuthState({ status: 'unauthenticated' });
    const router = renderAt(DETAIL_PATH);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(pageHeading()).toBeNull();
    expect(
      detail.requests.filter((request) =>
        request.path.startsWith('/patient/appointments'),
      ),
    ).toEqual([]);
  });
});
