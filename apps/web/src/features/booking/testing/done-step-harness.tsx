import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  BOOKING_DONE_ROUTE,
  BOOKING_PAYMENT_ROUTE,
  PATIENT_APPOINTMENTS_PATH,
  bookingDonePath,
} from '../../../shared/routes/booking-paths';
import { HOME_PATH } from '../wizard/done/done-actions';
import { BookingDonePage } from '../wizard/pages';
import { createFakeAppointmentDetailApi } from './fake-appointment-detail-api';
import { installFakeFetch } from './install-fake-fetch';
import { LocationProbe } from './location-probe';

// Dựng trang Bước 6 "Hoàn tất" (`BookingDonePage`: khung wizard, thanh bước, thân thật) với API giả của chi tiết lịch hẹn (booking F7). Dùng lại `createFakeAppointmentDetailApi` của F2:
// chi tiết `GET /patient/appointments/:maLichHen` trả `api.detail` cho MỌI mã (đặt lại trước khi đổi mã để thử đổi mã trên cùng route). Router dữ liệu thật (test đọc `router.state` và gọi
// `router.navigate`) nhưng KHÔNG có đăng nhập, cổng A4 hay bản nháp (đã có test ở F3 đến F5); các đích của hai nút và của liên kết thanh toán là trang giả có chữ để test nhận ra.
// Chỉ test dùng; KHÔNG gọi backend thật. Đăng nhập (`setAuthState`) do test lo nếu cần, vì `testing/` không import sâu vào `features/auth` (BWZ-08).
export const DONE_CODE = 'CLX-20261019-7K3M9';
export const DONE_API_PATH = `/patient/appointments/${DONE_CODE}`;
export const HOME_MARK = 'Trang chủ giả';
export const LIST_MARK = 'Danh sách lịch hẹn giả';
export const PAYMENT_MARK = 'Trang thanh toán giả';

export interface DoneHarnessOptions {
  // Đường dẫn lúc dựng (mặc định: Bước 6 của `DONE_CODE`)
  path?: string;
  // Phần tử thêm vào cạnh trang (ví dụ liên kết để đổi mã lịch hẹn trên URL)
  extra?: ReactNode;
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi lời gọi
  before?: (api: ReturnType<typeof createFakeAppointmentDetailApi>) => void;
}

export function renderDonePage(options: DoneHarnessOptions = {}) {
  const api = createFakeAppointmentDetailApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  installFakeFetch(api.fetch);
  options.before?.(api);
  const router = createMemoryRouter(
    [
      {
        path: BOOKING_DONE_ROUTE,
        element: (
          <>
            <BookingDonePage />
            <LocationProbe />
            {options.extra}
          </>
        ),
      },
      { path: BOOKING_PAYMENT_ROUTE, element: <p>{PAYMENT_MARK}</p> },
      { path: PATIENT_APPOINTMENTS_PATH, element: <p>{LIST_MARK}</p> },
      { path: HOME_PATH, element: <p>{HOME_MARK}</p> },
    ],
    { initialEntries: [options.path ?? bookingDonePath(DONE_CODE)] },
  );
  const view = render(<RouterProvider router={router} />);
  return { api, router, ...view };
}

export function cleanUpDonePage() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setApiAuthHooks(null);
}
