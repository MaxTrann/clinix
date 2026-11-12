import { act, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../../router/routes';
import { NETWORK_ERROR_MESSAGE } from '../../../../shared/api/error-message';
import { PATIENT_APPOINTMENTS_PATH } from '../../../../shared/routes/booking-paths';
import { createFakeAuthApi } from '../../../../test/fake-auth-api';
import { ROLE_HOME_PATHS, type AuthUser, type VaiTro } from '../../../auth';
import { resetAuthForTest } from '../../../auth/auth-session';
import { setAuthState } from '../../../auth/auth-store';
import {
  createFakeAppointmentListApi,
  makeAppointments,
} from '../../testing/fake-appointment-list-api';
import { LIST_TEXT } from './list-messages';

// booking F1 `[ĐỤNG router]`: trang đi qua ứng dụng thật (`createAppRoutes`) với API giả. Mã LHL là [đề xuất] (PLAN booking mục 7.31 sau khi duyệt).
// LHL-23: đúng vai, sai vai, khách; mục menu. LHL-21 (phần mất mạng): dải `OfflineBanner` nằm ở gốc router nên trang không thêm bản thứ hai.
let list: ReturnType<typeof createFakeAppointmentListApi>;

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

const pageHeading = () =>
  screen.queryByRole('heading', { level: 1, name: LIST_TEXT.title });

beforeEach(() => {
  resetAuthForTest();
  const auth = createFakeAuthApi();
  list = createFakeAppointmentListApi(auth.fetch);
  list.appointments = makeAppointments(3);
  vi.stubGlobal('fetch', vi.fn(list.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('route "Lịch hẹn của tôi"', () => {
  it('LHL-23 Bệnh nhân vào đường dẫn ⇒ trang nằm trong khung Bệnh nhân, mục menu có `href` đúng và `aria-current`, có dữ liệu', async () => {
    signedInAs('BenhNhan');
    const router = renderAt(PATIENT_APPOINTMENTS_PATH);

    const aside = await screen.findByRole('complementary', {
      name: 'Điều hướng Bệnh nhân',
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: LIST_TEXT.title }),
    ).toBeInTheDocument();
    const link = within(
      within(aside).getByRole('navigation', { name: 'Menu chính' }),
    ).getByRole('link', { name: 'Lịch hẹn của tôi' });
    expect(link).toHaveAttribute('href', PATIENT_APPOINTMENTS_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(router.state.location.pathname).toBe(PATIENT_APPOINTMENTS_PATH);
    expect(
      await screen.findByRole('region', { name: LIST_TEXT.resultsRegion }),
    ).toBeInTheDocument();
    expect(list.callsTo('/patient/appointments')).toHaveLength(1);
  });

  // Quyền thật do API kiểm; cổng ở giao diện chỉ để không hiện trang sai vai (PLAN 5.13). Sai vai hiện 404 như `RequireAuth` đã làm
  it.each(['LeTan', 'BacSi', 'QuanTriVien'] as const)(
    'LHL-23 %s mở đường dẫn của Bệnh nhân ⇒ 404, không thấy trang và không gọi API danh sách',
    async (vaiTro) => {
      signedInAs(vaiTro);
      renderAt(PATIENT_APPOINTMENTS_PATH);

      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(pageHeading()).toBeNull();
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Bệnh nhân' }),
      ).toBeNull();
      expect(list.callsTo('/patient/appointments')).toHaveLength(0);
      // Gốc khu của vai đó vẫn khác đường dẫn này
      expect(ROLE_HOME_PATHS[vaiTro]).not.toBe(ROLE_HOME_PATHS.BenhNhan);
    },
  );

  it('LHL-23 khách chưa đăng nhập ⇒ về /dang-nhap bằng replace, không lộ trang, không gọi API danh sách', async () => {
    setAuthState({ status: 'unauthenticated' });
    const router = renderAt(PATIENT_APPOINTMENTS_PATH);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(pageHeading()).toBeNull();
    expect(list.callsTo('/patient/appointments')).toHaveLength(0);
  });
});

describe('mất mạng', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  afterEach(() => {
    if (originalOnLine)
      Object.defineProperty(navigator, 'onLine', originalOnLine);
    else Reflect.deleteProperty(navigator, 'onLine');
  });

  const setOnline = async (online: boolean) => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => online,
    });
    await act(async () => {
      window.dispatchEvent(new Event(online ? 'online' : 'offline'));
    });
  };

  it('LHL-21 sự kiện `offline` ⇒ dải mất mạng của gốc hiện (một bản) mà trang và dữ liệu vẫn còn; có mạng lại thì dải mất', async () => {
    signedInAs('BenhNhan');
    renderAt(PATIENT_APPOINTMENTS_PATH);
    await screen.findByRole('region', { name: LIST_TEXT.resultsRegion });

    await setOnline(false);
    expect(screen.getAllByText(NETWORK_ERROR_MESSAGE)).toHaveLength(1);
    expect(pageHeading()).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: LIST_TEXT.resultsRegion }),
    ).toBeInTheDocument();

    await setOnline(true);
    expect(screen.queryByText(NETWORK_ERROR_MESSAGE)).toBeNull();
  });
});
