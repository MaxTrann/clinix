import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { AuthUser, VaiTro } from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import {
  createFakeRescheduleRequestsApi,
  fakeRecord,
} from '../features/booking/testing/fake-reschedule-requests-api';
import { makeRequestDetail } from '../features/booking/testing/reschedule-requests-fixtures';
import {
  RECEPTION_RESCHEDULE_REQUESTS_PATH,
  receptionRescheduleRequestDetailPath,
} from '../shared/routes/booking-paths';
import { createFakeAuthApi } from '../test/fake-auth-api';
import { createAppRoutes } from './routes';

// reschedule F4 `[ĐỤNG router]` (phiên kiểm duyệt 25/11/2026): trang "Yêu cầu đổi lịch" của Lễ tân ghép vào khung Lễ tân của router thật (WXD-01; WXD-79, WXD-80 `[đề xuất]`; đúng/sai vai trò theo AGENTS mục 4). Hai route cắm vào
// mảng `RECEPTION_APPOINTMENT_ROUTES` (một dòng spread) nên `role-routes.tsx` KHÔNG đổi; mục menu không đặt `end` nên trang chi tiết (trang con) vẫn làm sáng mục. API giả CHỈ cho các route của yêu cầu và
// danh sách bác sĩ công khai; mọi đường dẫn khác chuyển cho fake auth.
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

const CODE = 'CLX-20261120-7K3M9';

beforeEach(() => {
  resetAuthForTest();
  const auth = createFakeAuthApi();
  const requests = createFakeRescheduleRequestsApi(auth.fetch);
  requests.records = [
    fakeRecord(makeRequestDetail({ yeuCauId: '101', maLichHen: CODE })),
  ];
  vi.stubGlobal('fetch', vi.fn(requests.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const calledRequestRoutes = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([input]) => String(input))
    .filter((url) => url.includes('/reception/reschedule-requests'));

describe('route "Yêu cầu đổi lịch" của Lễ tân', () => {
  it('WXD-79 Lễ tân mở /le-tan/yeu-cau-doi-lich: trang trong khung Lễ tân, mục menu sáng và trỏ đúng đường dẫn, bảng có dữ liệu', async () => {
    signedInAs('LeTan');
    const router = renderAt(RECEPTION_RESCHEDULE_REQUESTS_PATH);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Yêu cầu đổi lịch',
      }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/le-tan/yeu-cau-doi-lich');

    const aside = screen.getByRole('complementary', {
      name: 'Điều hướng Lễ tân',
    });
    const link = within(aside).getByRole('link', { name: 'Yêu cầu đổi lịch' });
    expect(link).toHaveAttribute('href', RECEPTION_RESCHEDULE_REQUESTS_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
    // Trang thật chạy qua `lazy` và gọi đúng route của Lễ tân
    expect(await screen.findByText(CODE)).toBeInTheDocument();
    expect(calledRequestRoutes().length).toBeGreaterThan(0);
  });

  it('WXD-79 từ danh sách bấm `Chi tiết` ⇒ trang chi tiết (id trên đường dẫn), mục menu VẪN sáng (trang con), `Quay lại danh sách` ⇒ về danh sách', async () => {
    signedInAs('LeTan');
    const router = renderAt(RECEPTION_RESCHEDULE_REQUESTS_PATH);
    fireEvent.click(
      await screen.findByRole('link', {
        name: `Chi tiết yêu cầu của lịch hẹn ${CODE}`,
      }),
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Chi tiết yêu cầu đổi lịch',
      }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(
      receptionRescheduleRequestDetailPath('101'),
    );

    const aside = screen.getByRole('complementary', {
      name: 'Điều hướng Lễ tân',
    });
    expect(
      within(aside).getByRole('link', { name: 'Yêu cầu đổi lịch' }),
    ).toHaveAttribute('aria-current', 'page');
    // Mục menu của "Quản lý lịch hẹn" KHÔNG sáng ở trang của yêu cầu
    expect(
      within(aside).getByRole('link', { name: 'Quản lý lịch hẹn' }),
    ).not.toHaveAttribute('aria-current');

    fireEvent.click(
      await screen.findByRole('link', { name: 'Quay lại danh sách' }),
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Yêu cầu đổi lịch',
      }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(
      RECEPTION_RESCHEDULE_REQUESTS_PATH,
    );
  });

  it('WXD-79 mở thẳng trang chi tiết bằng đường dẫn: trang trong khung Lễ tân và hiện đúng yêu cầu', async () => {
    signedInAs('LeTan');
    renderAt(receptionRescheduleRequestDetailPath('101'));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Chi tiết yêu cầu đổi lịch',
      }),
    ).toBeVisible();
    expect(await screen.findByText(CODE)).toBeInTheDocument();
  });

  it.each(
    (['BenhNhan', 'BacSi', 'QuanTriVien'] as const).flatMap((vaiTro) => [
      [vaiTro, RECEPTION_RESCHEDULE_REQUESTS_PATH],
      [vaiTro, receptionRescheduleRequestDetailPath('101')],
    ]),
  )(
    'WXD-80 %s mở %s: 404, không thấy trang lẫn khung Lễ tân, không gọi route của yêu cầu',
    async (vaiTro, path) => {
      signedInAs(vaiTro);
      renderAt(path);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('heading', { level: 1, name: 'Yêu cầu đổi lịch' }),
      ).toBeNull();
      expect(
        screen.queryByRole('heading', {
          level: 1,
          name: 'Chi tiết yêu cầu đổi lịch',
        }),
      ).toBeNull();
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Lễ tân' }),
      ).toBeNull();
      expect(calledRequestRoutes()).toEqual([]);
    },
  );

  it('WXD-80 khách mở đường dẫn: về /dang-nhap, không lộ trang', async () => {
    setAuthState({ status: 'unauthenticated', user: null });
    const router = renderAt(RECEPTION_RESCHEDULE_REQUESTS_PATH);
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Yêu cầu đổi lịch' }),
    ).toBeNull();
    expect(calledRequestRoutes()).toEqual([]);
  });
});
