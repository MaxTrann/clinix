import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Link, createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppRoutes } from '../../../../router/routes';
import {
  bookingDonePath,
  bookingInfoPath,
} from '../../../../shared/routes/booking-paths';
import { createFakeAuthApi } from '../../../../test/fake-auth-api';
import { resetAuthForTest } from '../../../auth/auth-session';
import { setAuthState } from '../../../auth/auth-store';
import { flush, holdResponse } from '../../testing/appointment-detail-harness';
import {
  DONE_API_PATH,
  DONE_CODE,
  cleanUpDonePage,
  renderDonePage,
} from '../../testing/done-step-harness';
import { makeDetail } from '../../testing/fake-appointment-detail-api';
import { jsonResponse } from '../../testing/fake-appointment-list-api';
import {
  createFakeBookingApi,
  makeCheckResult,
  makeCreatedDone,
} from '../../testing/fake-booking-api';
import { DONE_TEXT } from './done-messages';

// booking F7: tải lại, đổi mã, gỡ trang, kho trình duyệt, trợ năng và đường đi từ Bước 5 của Bước 6. HTA-01…HTA-06 là [đề xuất] (PLAN booking mục 7.42); WZ-05, WZ-09, WZ-11,
// WZ-13, WZ-14 (phần F7). Bước 6 chỉ ĐỌC: không có lời gọi ghi nào, không `await` nào do F7 viết (nên không `usePageActive`). Dữ liệu giả; không gọi backend thật.
afterEach(() => {
  cleanUpDonePage();
  vi.restoreAllMocks();
});
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const heading = (name: string) =>
  screen.findByRole('heading', { level: 1, name });

describe('HTA tải, đổi mã, gỡ trang', () => {
  it('HTA-01 WZ-11 WZ-09 vào thẳng bằng URL (không qua Bước 5): đúng MỘT GET, không lời gọi ghi nào', async () => {
    const { api } = renderDonePage();

    await heading(DONE_TEXT.successTitle);
    await flush();
    expect(api.requests).toHaveLength(1);
    expect(api.callsTo('GET', DONE_API_PATH)).toHaveLength(1);
    expect(api.writes()).toHaveLength(0);
  });

  it('HTA-02 WZ-11 đổi `maLichHen` trên cùng route: tải lại đúng mã mới và KHÔNG hiện phiếu của mã trước trong lúc tải', async () => {
    const OTHER = 'CLX-20261105-AB123';
    const { api } = renderDonePage({
      extra: <Link to={bookingDonePath(OTHER)}>Đổi mã</Link>,
      before: (fake) => {
        fake.detail = makeDetail({
          maLichHen: DONE_CODE,
          dichVu: 'Dịch vụ của mã đầu',
        });
      },
    });
    await heading(DONE_TEXT.successTitle);
    expect(screen.getByText('Dịch vụ của mã đầu')).toBeInTheDocument();

    // Mã mới: giữ phản hồi lại để quan sát lúc đang tải
    const held = holdResponse(() =>
      jsonResponse(
        makeDetail({ maLichHen: OTHER, dichVu: 'Dịch vụ của mã sau' }),
      ),
    );
    api.failNext('detail', held.override);
    fireEvent.click(screen.getByRole('link', { name: 'Đổi mã' }));

    await waitFor(() =>
      expect(api.callsTo('GET', `/patient/appointments/${OTHER}`)).toHaveLength(
        1,
      ),
    );
    expect(screen.getByText(DONE_TEXT.loading)).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.queryByText('Dịch vụ của mã đầu')).toBeNull();
    expect(screen.queryByText(DONE_CODE)).toBeNull();
    expect(screen.getByTestId('booking-step-6-body')).toHaveAttribute(
      'data-reference',
      OTHER,
    );

    held.release();
    expect(await screen.findByText('Dịch vụ của mã sau')).toBeInTheDocument();
    expect(screen.getByText(OTHER)).toBeInTheDocument();
    expect(screen.queryByText('Dịch vụ của mã đầu')).toBeNull();
  });

  it('HTA-03 WZ-13 gỡ trang khi đang tải: yêu cầu bị huỷ, không cảnh báo, phản hồi muộn không làm gì', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const held = holdResponse(() => jsonResponse(makeDetail()));
    let signal: AbortSignal | null | undefined;
    const { api, unmount } = renderDonePage({
      before: (fake) =>
        fake.failNext('detail', (init) => {
          signal = init?.signal;
          return held.override();
        }),
    });
    await waitFor(() =>
      expect(api.callsTo('GET', DONE_API_PATH)).toHaveLength(1),
    );
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
    held.release();
    await flush();
    expect(errors).not.toHaveBeenCalled();
    expect(api.requests).toHaveLength(1);
  });

  it('HTA-04 WZ-09 không kho trình duyệt, URL, tiêu đề, log: sau cả vòng tải, `localStorage`, `sessionStorage`, cookie rỗng, URL và tiêu đề không đổi, không `console.*`', async () => {
    const consoleCalls = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    // Tiêu đề gốc đặt TƯỜNG MINH trước khi vẽ: các ca trước trong cùng file đã vẽ Bước 6 nên không được đọc giá trị lúc bắt đầu làm gốc (đột biến M4 từng sống sót vì vậy)
    const title = 'Tiêu đề gốc của test';
    document.title = title;
    renderDonePage({
      before: (api) => {
        api.detail = makeDetail({ lyDoKham: 'ĐAU-NGỰC-NHẬN-DẠNG' });
      },
    });

    await heading(DONE_TEXT.successTitle);
    await flush();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(document.title).toBe(title);
    expect(screen.getByTestId('url')).toHaveTextContent(
      bookingDonePath(DONE_CODE),
    );
    expect(consoleCalls.map((spy) => spy.mock.calls.length)).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });
});

describe('HTA trợ năng (WZ-14, phần F7)', () => {
  it('HTA-05 tiêu điểm vào `h1` MỘT lần khi nội dung đầu tiên hiện (kể cả sau `Thử lại`); một `h1`; không vùng `aria-live` thứ hai; render lại không kéo tiêu điểm về', async () => {
    const { api, router } = renderDonePage({
      before: (fake) =>
        fake.failNext('detail', () =>
          Promise.reject(new TypeError('Failed to fetch')),
        ),
    });
    await screen.findByRole('alert');
    // Lỗi: chưa có `h1` nên chưa chuyển tiêu điểm
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    const title = await heading(DONE_TEXT.successTitle);
    expect(title).toHaveFocus();
    expect(api.callsTo('GET', DONE_API_PATH)).toHaveLength(2);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      document.querySelectorAll('[aria-live], [role="status"], [role="alert"]'),
    ).toHaveLength(0);

    // Người dùng đã chuyển tiêu điểm sang liên kết; một lần vẽ lại (đổi query, cùng mã) không được giật nó về `h1`
    const link = screen.getByRole('link', { name: DONE_TEXT.myAppointments });
    link.focus();
    await act(async () => {
      await router.navigate(`${bookingDonePath(DONE_CODE)}?x=1`);
    });
    expect(link).toHaveFocus();
    expect(title).not.toHaveFocus();
  });
});

// ---- Qua ỨNG DỤNG THẬT: Bước 4 ⇒ Bước 5 (cọc 0đ) ⇒ Bước 6 ----
describe('HTA Bước 5 ⇒ Bước 6 qua ứng dụng thật', () => {
  const INFO = '/dat-lich/thong-tin?khungGioId=5';
  let booking: ReturnType<typeof createFakeBookingApi>;

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
  });

  afterEach(() => {
    resetAuthForTest();
  });

  it('HTA-06 WZ-05 WZ-11 cọc 0đ: Bước 5 ⇒ Bước 6 hiện phiếu TẢI TỪ API (đúng mã, một GET), rồi Back về Bước 4 (không Bước 5), vẫn đúng một POST tạo lịch', async () => {
    booking.detailApi.detail = makeDetail({
      maLichHen: DONE_CODE,
      tienCoc: '0.00',
      dichVu: 'Dịch vụ từ GET chi tiết',
    });
    booking.check = makeCheckResult({ tienCoc: '0.00', chinhSachHoan: null });
    booking.created = makeCreatedDone();

    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: [bookingInfoPath('5')],
    });
    render(<RouterProvider router={router} />);
    await screen.findByTestId('booking-step-4-body');
    const next = await screen.findByRole('button', { name: 'Tiếp tục' });
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);
    const confirm = () =>
      screen.getByRole('button', { name: /^(Xác nhận|Đang xử lý)/ });
    await screen.findByRole('region', { name: 'Chi tiết lịch hẹn' });
    await waitFor(() => expect(confirm()).toBeEnabled());
    fireEvent.click(confirm());

    await heading(DONE_TEXT.successTitle);
    expect(router.state.location.pathname).toBe(bookingDonePath(DONE_CODE));
    // Nội dung phiếu đến từ GET chi tiết, không từ 201 hay bản nháp (đã xoá)
    expect(screen.getByText('Dịch vụ từ GET chi tiết')).toBeInTheDocument();
    expect(booking.detailApi.callsTo('GET', DONE_API_PATH)).toHaveLength(1);
    expect(booking.count('POST', '/booking/appointments')).toBe(1);

    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() =>
      expect(
        router.state.location.pathname + router.state.location.search,
      ).toBe(INFO),
    );
    await screen.findByTestId('booking-step-4-body');
    expect(
      within(document.body).queryByText(DONE_TEXT.successTitle),
    ).toBeNull();
    expect(booking.count('POST', '/booking/appointments')).toBe(1);
  });
});
