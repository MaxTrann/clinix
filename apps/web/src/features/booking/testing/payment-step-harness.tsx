import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  BOOKING_DONE_ROUTE,
  BOOKING_PATH,
  BOOKING_PAYMENT_ROUTE,
  PATIENT_APPOINTMENT_DETAIL_ROUTE,
  PATIENT_APPOINTMENTS_PATH,
  bookingPaymentPath,
} from '../../../shared/routes/booking-paths';
import { BookingPaymentPage } from '../wizard/pages';
import {
  createFakeAppointmentDetailApi,
  makeDetail,
} from './fake-appointment-detail-api';
import { createFakeDepositGateway } from './fake-deposit-gateway';
import { installFakeFetch } from './install-fake-fetch';
import { LocationProbe } from './location-probe';

// Dựng trang Bước Thanh toán (`BookingPaymentPage`: khung wizard, thanh bước, thân thật, `DepositPaymentPanel` THẬT) với API giả của chi tiết lịch hẹn và của hai điểm cuối thanh toán
// cọc (booking F6). Router dữ liệu thật (test đọc `router.state` và gọi `router.navigate`) nhưng KHÔNG có đăng nhập, cổng A4 hay bản nháp (đã có test ở F3 đến F5); các đích (Bước 6, danh sách,
// chi tiết lịch, Bước 1) là trang giả có chữ để test nhận ra. Chỉ test dùng; KHÔNG gọi backend thật. Đồng hồ giả do test đặt TRƯỚC khi gọi `renderPaymentPage`.
export const PAY_CODE = 'CLX-20261123-4P7K2';
export const PAY_API_PATH = `/patient/appointments/${PAY_CODE}`;
export const PREVIEW_API_PATH = `${PAY_API_PATH}/payment-preview`;
export const PAY_POST_API_PATH = `${PAY_API_PATH}/payment`;
export const DONE_MARK = 'Trang hoàn tất giả';
export const LIST_MARK = 'Danh sách lịch hẹn giả';
export const DETAIL_MARK = 'Chi tiết lịch hẹn giả';
export const START_MARK = 'Bước chọn dịch vụ giả';

// Mốc "bây giờ" của đồng hồ giả trong test của F6
export const NOW_ISO = '2026-11-23T08:00:00.000Z';
export const NOW_MS = Date.parse(NOW_ISO);

// Lịch `ChoThanhToan` cho trang thanh toán, dựng quanh `Date.now()` HIỆN TẠI (đồng hồ giả): `thoiGianMayChu` = giờ máy + `skewMs`, `hanThanhToan` = `thoiGianMayChu` + `leftMs`.
// `skewMs` = giờ máy chủ lệch giờ máy bao nhiêu (+90 giây: máy chủ nhanh hơn; −90 giây: chậm hơn). `leftMs = null` ⇒ không có hạn.
export function holdDetail(
  options: {
    leftMs?: number | null;
    skewMs?: number;
    overrides?: Parameters<typeof makeDetail>[0];
  } = {},
) {
  const { leftMs = 900_000, skewMs = 0, overrides } = options;
  const serverNow = Date.now() + skewMs;
  return makeDetail({
    maLichHen: PAY_CODE,
    trangThai: 'ChoThanhToan',
    hanThanhToan:
      leftMs === null ? null : new Date(serverNow + leftMs).toISOString(),
    thoiGianMayChu: new Date(serverNow).toISOString(),
    ...overrides,
  });
}

export interface PaymentHarnessOptions {
  // Đường dẫn lúc dựng (mặc định: Bước Thanh toán của `PAY_CODE`)
  path?: string;
  // Phần tử thêm vào cạnh trang (ví dụ liên kết để đổi mã lịch hẹn trên URL)
  extra?: ReactNode;
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi lời gọi
  before?: (
    api: ReturnType<typeof createFakeAppointmentDetailApi>,
    gateway: ReturnType<typeof createFakeDepositGateway>,
  ) => void;
}

export function renderPaymentPage(options: PaymentHarnessOptions = {}) {
  const gateway = createFakeDepositGateway(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  // Mọi lời gọi đi qua API chi tiết trước (nó ghi MỌI lời gọi vào `requests`, kể cả đường dẫn chuyển đi), rồi mới tới API thanh toán cọc
  const api = createFakeAppointmentDetailApi(gateway.fetch);
  installFakeFetch(api.fetch);
  options.before?.(api, gateway);
  const router = createMemoryRouter(
    [
      {
        path: BOOKING_PAYMENT_ROUTE,
        element: (
          <>
            <BookingPaymentPage />
            <LocationProbe />
            {options.extra}
          </>
        ),
      },
      { path: BOOKING_DONE_ROUTE, element: <p>{DONE_MARK}</p> },
      { path: PATIENT_APPOINTMENTS_PATH, element: <p>{LIST_MARK}</p> },
      { path: PATIENT_APPOINTMENT_DETAIL_ROUTE, element: <p>{DETAIL_MARK}</p> },
      { path: BOOKING_PATH, element: <p>{START_MARK}</p> },
    ],
    { initialEntries: [options.path ?? bookingPaymentPath(PAY_CODE)] },
  );
  const view = render(<RouterProvider router={router} />);
  return { api, gateway, router, ...view };
}

export function cleanUpPaymentPage() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setApiAuthHooks(null);
}

// Đồng hồ giả CHỈ cho `Date` và bộ hẹn giờ lặp; giữ `setTimeout` thật để promise, router và `findBy` chạy được (nếp của `forgot-password-page.test.tsx`)
export function fakeClock(now: number = NOW_MS) {
  vi.useFakeTimers({
    now,
    toFake: ['setInterval', 'clearInterval', 'Date'],
  });
}

// Chạy `ms` mili giây của đồng hồ giả (cả `Date`), kèm phần việc async đang chờ
export async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
