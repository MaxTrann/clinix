import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  Link,
  createMemoryRouter,
  type NonIndexRouteObject,
  type RouteObject,
} from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import {
  bookingConfirmPath,
  bookingInfoPath,
} from '../../../shared/routes/booking-paths';
import { createFakeAuthApi } from '../../../test/fake-auth-api';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { RequireAuth } from '../../auth';
import { LOCKED, createFakeBookingApi } from '../testing/fake-booking-api';
import { useBookingDraft } from './booking-draft-context';
import { BOOKING_WIZARD_ROUTES } from './wizard-routes';

// booking F3. WZ-08, WZ-09 (PLAN booking 7.15) phần của F3; BWZ-02, BWZ-06 là [đề xuất] (mục 7.27). Đi qua ứng dụng thật (`createAppRoutes`)
// với API giả; phần "chưa đăng nhập, đăng nhập rồi quay lại đúng URL" của WZ-08 ở `features/auth/return-flow.test.tsx` (BRT-07).
const LYDO_BI_MAT = 'đau đầu kéo dài ba tuần, nghi ngờ bệnh mạn tính';
const INVALID = 'Liên kết chọn khung giờ không hợp lệ.';

let booking: ReturnType<typeof createFakeBookingApi>;

function renderApp(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const here = (router: ReturnType<typeof renderApp>) => {
  const { pathname, search } = router.state.location;
  return pathname + search;
};
const stepperItems = () =>
  within(
    screen.getByRole('navigation', { name: 'Các bước đặt lịch' }),
  ).getAllByRole('listitem');
const currentStep = () =>
  stepperItems().findIndex(
    (item) => item.getAttribute('aria-current') === 'step',
  ) + 1;
// `router.navigate` đổi trạng thái router TRƯỚC khi React vẽ xong và trước khi `<Navigate>` của trang chạy: bọc trong `act`, rồi chờ
// URL cuối bằng `waitFor` (chỉ chờ `findByTestId` thì có thể khớp phần tử của trang CŨ chưa gỡ).
async function navigateTo(router: ReturnType<typeof renderApp>, to: string) {
  await act(async () => {
    await router.navigate(to);
  });
}
const bookingCalls = () =>
  booking.requests.filter((request) => request.path.startsWith('/booking'));

beforeEach(() => {
  resetAuthForTest();
  setAuthState({
    status: 'authenticated',
    user: { vaiTro: 'BenhNhan', hoTen: 'Người mẫu', daXacMinhEmail: true },
  });
  booking = createFakeBookingApi(createFakeAuthApi().fetch);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/public/')
        ? Promise.resolve(new Response('{}', { status: 500 }))
        : booking.fetch(input, init),
    ),
  );
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  resetAuthForTest();
  vi.unstubAllGlobals();
});

describe('booking F3 — khung wizard trong ứng dụng', () => {
  it('BWZ-02 khungGioId thiếu hay sai dạng ⇒ thông báo + liên kết về Bước 1, KHÔNG gọi API booking', async () => {
    const urls = [
      '/dat-lich/thong-tin',
      '/dat-lich/thong-tin?khungGioId=',
      '/dat-lich/thong-tin?khungGioId=0',
      '/dat-lich/thong-tin?khungGioId=007',
      '/dat-lich/thong-tin?khungGioId=1.5',
      '/dat-lich/thong-tin?khungGioId=9223372036854775808',
      '/dat-lich/thong-tin?khungGioId=1&khungGioId=2',
      '/dat-lich/xac-nhan?khungGioId=abc',
      '/dat-lich/xac-nhan',
    ];
    for (const url of urls) {
      renderApp(url);
      expect(await screen.findByText(INVALID)).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Chọn lại dịch vụ' }),
      ).toHaveAttribute('href', '/dat-lich');
      expect(screen.queryByTestId(/booking-step-\d-body/)).toBeNull();
      cleanup();
    }
    expect(bookingCalls()).toEqual([]);
  });

  it('WZ-08 đã đăng nhập mở ?khungGioId= ⇒ ở lại đúng URL, đúng khung giờ, Bước 4 đang chọn; chỉ GET cổng, KHÔNG giữ chỗ', async () => {
    const router = renderApp(bookingInfoPath('5'));
    const body = await screen.findByTestId('booking-step-4-body');
    expect(body).toHaveAttribute('data-reference', '5');
    expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=5');
    expect(currentStep()).toBe(4);
    // Bước 1 bấm được để chọn lại; mọi lời gọi booking chỉ là GET cổng
    expect(
      screen.getByRole('link', { name: 'Quay lại bước 1: Nhóm dịch vụ' }),
    ).toHaveAttribute('href', '/dat-lich');
    expect(bookingCalls()).toEqual([
      { method: 'GET', path: '/booking/eligibility' },
    ]);
    expect(booking.bookingWrites()).toEqual([]);
  });

  it('WZ-08 chuyển trang không giữ chỗ: sang Bước 5 khi chưa có bản nháp ⇒ về Bước 4 (thay mục lịch sử), vẫn không có lời gọi ghi', async () => {
    const router = renderApp(bookingInfoPath('5'));
    await screen.findByTestId('booking-step-4-body');
    await navigateTo(router, bookingConfirmPath('5'));

    await waitFor(() =>
      expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=5'),
    );
    await screen.findByTestId('booking-step-4-body');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(booking.bookingWrites()).toEqual([]);
    for (const request of booking.requests) {
      expect(request.path).not.toBe('/booking/appointments');
      expect(request.path).not.toBe('/booking/checks');
    }
  });

  it('BWZ-06 Thanh toán và Hoàn tất: không qua cổng A4 (cả khi bị khoá), đọc mã lịch hẹn từ URL, đúng bước trên thanh bước', async () => {
    booking.eligibility = LOCKED;

    renderApp('/dat-lich/thanh-toan/CP20261018001');
    const payment = await screen.findByTestId('booking-step-5-body');
    expect(payment).toHaveAttribute('data-reference', 'CP20261018001');
    expect(currentStep()).toBe(5);
    expect(
      screen.getByRole('link', { name: 'Quay lại bước 1: Nhóm dịch vụ' }),
    ).toBeInTheDocument();
    cleanup();

    renderApp('/dat-lich/hoan-tat/CP20261018001');
    const done = await screen.findByTestId('booking-step-6-body');
    expect(done).toHaveAttribute('data-reference', 'CP20261018001');
    expect(currentStep()).toBe(6);
    // Figma `453:2`: Bước 6 không có nút "Quay lại" nào
    expect(
      within(
        screen.getByRole('navigation', { name: 'Các bước đặt lịch' }),
      ).queryAllByRole('link'),
    ).toHaveLength(0);
    cleanup();

    // Mã có `/` được giải mã từ đường dẫn
    renderApp('/dat-lich/thanh-toan/a%2Fb');
    expect(await screen.findByTestId('booking-step-5-body')).toHaveAttribute(
      'data-reference',
      'a/b',
    );
    expect(booking.count('GET', '/booking/eligibility')).toBe(0);
  });
});

// Trang thử đặt TRONG layout của wizard để ghi bản nháp như F4 sẽ làm (F3 chưa có ô nhập thật)
function DraftSetter() {
  const { setDraft } = useBookingDraft();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          setDraft({
            khungGioId: '5',
            hoSoNguoiThanId: '2',
            lyDoKham: LYDO_BI_MAT,
          })
        }
      >
        Ghi nháp
      </button>
      <Link to={bookingConfirmPath('5')}>Sang Bước 5</Link>
      <Link to={bookingConfirmPath('6')}>Sang Bước 5 của khung giờ khác</Link>
      <Link to="/ngoai">Rời wizard</Link>
    </div>
  );
}

function renderWithDraftSetter() {
  const [layout] = BOOKING_WIZARD_ROUTES as NonIndexRouteObject[];
  const routes: RouteObject[] = [
    {
      element: <RequireAuth roles={['BenhNhan']} />,
      children: [
        {
          ...layout,
          children: [
            ...(layout.children ?? []),
            { path: '/thu-ghi-nhap', element: <DraftSetter /> },
          ],
        },
      ],
    },
    { path: '/ngoai', element: <p>Ngoài wizard</p> },
  ];
  const router = createMemoryRouter(routes, {
    initialEntries: ['/thu-ghi-nhap'],
  });
  render(<RouterProvider router={router} />);
  return router;
}

function storageDump(): string {
  const dump: Record<string, string | null> = {};
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) ?? '';
      dump[key] = storage.getItem(key);
    }
  }
  return JSON.stringify(dump) + document.cookie;
}

describe('booking F3 — bản nháp chỉ ở bộ nhớ (Q38)', () => {
  it('WZ-09 có bản nháp đúng khung giờ ⇒ vào Bước 5; storage và cookie KHÔNG chứa lý do khám hay hồ sơ', async () => {
    renderWithDraftSetter();
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi nháp' }));
    fireEvent.click(screen.getByRole('link', { name: 'Sang Bước 5' }));

    const body = await screen.findByTestId('booking-step-5-body');
    expect(body).toHaveAttribute('data-reference', '5');
    expect(currentStep()).toBe(5);
    // Ở Bước 5 bấm được Bước 1 và Bước 4 (Figma `451:2`)
    expect(
      screen.getByRole('link', { name: 'Quay lại bước 4: Người khám' }),
    ).toHaveAttribute('href', '/dat-lich/thong-tin?khungGioId=5');

    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
    expect(storageDump()).not.toContain('đau đầu');
    expect(storageDump()).not.toContain(LYDO_BI_MAT);
    expect(booking.bookingWrites()).toEqual([]);
  });

  it('WZ-09 bản nháp của khung giờ khác ⇒ Bước 5 đưa về Bước 4 của khung giờ trên URL', async () => {
    const router = renderWithDraftSetter();
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi nháp' }));
    fireEvent.click(
      screen.getByRole('link', { name: 'Sang Bước 5 của khung giờ khác' }),
    );

    await screen.findByTestId('booking-step-4-body');
    expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=6');
    expect(screen.queryByTestId('booking-step-5-body')).toBeNull();
  });

  it('WZ-09 tải lại Bước 5 (bộ nhớ mất) hay rời wizard rồi quay lại ⇒ về Bước 4', async () => {
    // Rời wizard: layout gỡ, bản nháp mất
    const router = renderWithDraftSetter();
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi nháp' }));
    fireEvent.click(screen.getByRole('link', { name: 'Rời wizard' }));
    await screen.findByText('Ngoài wizard');
    await navigateTo(router, bookingConfirmPath('5'));
    await screen.findByTestId('booking-step-4-body');
    await waitFor(() =>
      expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=5'),
    );
    cleanup();

    // Tải lại = dựng ứng dụng mới ở đúng URL của Bước 5: không có gì để khôi phục
    const reloaded = renderApp(bookingConfirmPath('5'));
    await screen.findByTestId('booking-step-4-body');
    expect(here(reloaded)).toBe('/dat-lich/thong-tin?khungGioId=5');
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });
});
