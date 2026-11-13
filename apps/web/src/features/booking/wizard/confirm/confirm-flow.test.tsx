import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../../router/routes';
import { bookingInfoPath } from '../../../../shared/routes/booking-paths';
import { createFakeAuthApi } from '../../../../test/fake-auth-api';
import { resetAuthForTest } from '../../../auth/auth-session';
import { setAuthState } from '../../../auth/auth-store';
import {
  createFakeBookingApi,
  makeCheckResult,
  makeCreatedDone,
  makeCreatedResult,
} from '../../testing/fake-booking-api';
import { destinationAfterCreate } from './after-create';

// booking F5: Bước 5 qua ỨNG DỤNG THẬT (`createAppRoutes()`: khung wizard, cổng A4, bản nháp thật, `usePageActive` thật) với API giả. WZ-05, WZ-08 (phần Bước 5), WZ-13 của PLAN booking 7.15;
// XNA-01, XNA-07 (phần `usePageActive` thật) và XNS-06 (phần Bước 4 khôi phục) là [đề xuất] (mục 7.40). Ca XNA-01 là ca duy nhất bắt được việc xoá bản nháp TRƯỚC khi router kịp đổi
// trang (đột biến M22): `BookingConfirmPage` thấy bản nháp rỗng là đưa người dùng về Bước 4.
const REASON = 'đau lưng 2 tuần';
const CODE = 'CLX-20261019-7K3M9';
const INFO = '/dat-lich/thong-tin?khungGioId=5';
const CONFIRM = '/dat-lich/xac-nhan?khungGioId=5';

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
const textbox = () =>
  screen.getByRole('textbox', { name: 'Lý do khám (không bắt buộc)' });
const continueButton = () => screen.getByRole('button', { name: 'Tiếp tục' });
const confirmButton = () =>
  screen.getByRole('button', { name: /^(Xác nhận|Đang xử lý)/ });

// Bước 4 ⇒ gõ lý do (tuỳ chọn) ⇒ Tiếp tục ⇒ Bước 5 đã tải xong tóm tắt
async function goToStep5(reason?: string) {
  const router = renderApp(bookingInfoPath('5'));
  await screen.findByTestId('booking-step-4-body');
  await waitFor(() => expect(continueButton()).toBeEnabled());
  if (reason !== undefined) {
    fireEvent.change(textbox(), { target: { value: reason } });
  }
  fireEvent.click(continueButton());
  await screen.findByRole('region', { name: 'Chi tiết lịch hẹn' });
  await waitFor(() => expect(confirmButton()).toBeEnabled());
  expect(here(router)).toBe(CONFIRM);
  expect(currentStep()).toBe(5);
  return router;
}

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

describe('booking F5 — điều hướng sau khi tạo (WZ-05)', () => {
  it('XNA-01 WZ-05 cọc > 0 (`canThanhToan` true): tới trang Thanh toán của đúng mã, THAY mục lịch sử (Back không quay lại Bước 5), bản nháp đã xoá (Bước 4 mở lại với form mặc định), một POST', async () => {
    const router = await goToStep5(REASON);
    fireEvent.click(confirmButton());

    // Đích là trang Thanh toán (thân tạm của F3, vẫn là bước 5 trên thanh bước), KHÔNG rơi về Bước 4
    await waitFor(() =>
      expect(here(router)).toBe(`/dat-lich/thanh-toan/${CODE}`),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    const body = await screen.findByTestId('booking-step-5-body');
    expect(body).toHaveAttribute('data-reference', CODE);
    expect(currentStep()).toBe(5);
    // Đợi thêm một nhịp: bản nháp được xoá khi thân Bước 5 bị gỡ, không được kéo người dùng đi đâu nữa
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(here(router)).toBe(`/dat-lich/thanh-toan/${CODE}`);
    expect(booking.createBodies).toStrictEqual([
      { khungGioId: '5', hoSoNguoiThanId: null, lyDoKham: REASON },
    ]);
    expect(booking.count('POST', '/booking/appointments')).toBe(1);

    // Back: mục Bước 5 đã bị thay nên về Bước 4 (không phải Bước 5), và bản nháp (lý do đã gõ) đã xoá
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(here(router)).toBe(INFO));
    await screen.findByTestId('booking-step-4-body');
    expect(textbox()).toHaveValue('');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('XNA-01 WZ-05 cọc 0đ (`canThanhToan` false, `DaXacNhan`): tới Bước 6 "Hoàn tất" của đúng mã, KHÔNG qua trang Thanh toán, thay mục lịch sử', async () => {
    booking.check = makeCheckResult({ tienCoc: '0.00', chinhSachHoan: null });
    booking.created = makeCreatedDone();
    const router = await goToStep5();
    expect(confirmButton()).toHaveTextContent('Xác nhận đặt lịch');
    // Ghi lại MỌI trang router đi qua kể từ lúc bấm: không được có trang Thanh toán
    const visited: string[] = [];
    router.subscribe((state) => visited.push(state.location.pathname));
    fireEvent.click(confirmButton());

    await waitFor(() =>
      expect(here(router)).toBe(`/dat-lich/hoan-tat/${CODE}`),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(await screen.findByTestId('booking-step-6-body')).toHaveAttribute(
      'data-reference',
      CODE,
    );
    expect(currentStep()).toBe(6);
    expect(
      visited.some((path) => path.startsWith('/dat-lich/thanh-toan')),
    ).toBe(false);
    expect(booking.count('POST', '/booking/appointments')).toBe(1);
  });

  it('XNA-01 đích chỉ theo `canThanhToan` (hàm thuần): `true` ⇒ Thanh toán, `false` ⇒ Hoàn tất; mã được mã hoá an toàn trong đường dẫn', () => {
    const created = (overrides: Record<string, unknown>) =>
      makeCreatedResult(overrides) as Parameters<
        typeof destinationAfterCreate
      >[0];
    expect(destinationAfterCreate(created({}))).toBe(
      `/dat-lich/thanh-toan/${CODE}`,
    );
    expect(destinationAfterCreate(created(makeCreatedDone()))).toBe(
      `/dat-lich/hoan-tat/${CODE}`,
    );
    // Đích KHÔNG phụ thuộc `tienCoc` hay `trangThai` mà chỉ `canThanhToan`
    expect(
      destinationAfterCreate(
        created({ canThanhToan: false, tienCoc: '100000.00' }),
      ),
    ).toBe(`/dat-lich/hoan-tat/${CODE}`);
    expect(
      destinationAfterCreate(created({ canThanhToan: true, tienCoc: '0.00' })),
    ).toBe(`/dat-lich/thanh-toan/${CODE}`);
  });
});

describe('booking F5 — `usePageActive` thật và `Sửa` về Bước 4', () => {
  it('XNA-07 WZ-13 người dùng rời Bước 5 khi `POST` còn chờ, rồi 201 về ⇒ KHÔNG bị kéo tới Thanh toán; vẫn ở trang họ vừa mở', async () => {
    let release: (response: Response) => void = () => {};
    booking.failCreateNext(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const router = await goToStep5();
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(confirmButton()).toHaveTextContent('Đang xử lý…'),
    );

    // Rời trang bằng thanh bước ở khung (không thuộc thân Bước 5, nên không bị khoá)
    await act(async () => {
      await router.navigate('/dat-lich');
    });
    await waitFor(() => expect(here(router)).toBe('/dat-lich'));

    release(
      new Response(JSON.stringify(booking.created), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(here(router)).toBe('/dat-lich');
    expect(booking.count('POST', '/booking/appointments')).toBe(1);
  });

  it('XNS-06 WZ-08 `Sửa lý do khám` ⇒ Bước 4 khôi phục lý do và hồ sơ từ bản nháp, `checks` ở Bước 4 gọi ĐÚNG MỘT lần, không lời gọi ghi; tiếp tục lại tới Bước 5', async () => {
    const router = await goToStep5(REASON);
    expect(booking.count('POST', '/booking/checks')).toBe(2);

    fireEvent.click(screen.getByRole('link', { name: 'Sửa lý do khám' }));
    await screen.findByTestId('booking-step-4-body');
    expect(here(router)).toBe(INFO);
    await waitFor(() => expect(continueButton()).toBeEnabled());
    expect(textbox()).toHaveValue(REASON);
    expect(booking.count('POST', '/booking/checks')).toBe(3);
    expect(booking.bookingWrites()).toEqual([]);

    fireEvent.click(continueButton());
    await screen.findByRole('region', { name: 'Chi tiết lịch hẹn' });
    expect(here(router)).toBe(CONFIRM);
    expect(
      within(
        screen.getByRole('region', { name: 'Chi tiết lịch hẹn' }),
      ).getByText(REASON),
    ).toBeInTheDocument();
    expect(booking.bookingWrites()).toEqual([]);
  });
});
