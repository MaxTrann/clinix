import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import {
  BOOKING_CONFIRM_PATH,
  BOOKING_INFO_PATH,
  BOOKING_PATH,
  bookingInfoPath,
} from '../../../shared/routes/booking-paths';
import { createFakeBookingApi } from './fake-booking-api';
import { installFakeFetch } from './install-fake-fetch';
import { ConfirmProbe, HarnessLayout, InfoRoute } from './info-step-routes';

// Dựng Bước 4 với API giả (booking F4): bản nháp thật (`BookingDraftProvider`), đường dẫn Bước 4 và Bước 5 thật, router dữ liệu thật (để test đọc `router.state` và lùi
// lịch sử), nhưng KHÔNG có khung, cổng A4 và đăng nhập (đã có test ở F3). Bước 5 chỉ là một bảng đọc bản nháp để test khẳng định thứ `Tiếp tục` đã ghi. Không có ở bộ xuất
// của module: chỉ test dùng. Đăng nhập (`setAuthState`) do test lo, vì `testing/` không được import sâu vào `features/auth` (BWZ-08). KHÔNG gọi backend thật.
export interface InfoHarnessOptions {
  path?: string;
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi lời gọi
  before?: (api: ReturnType<typeof createFakeBookingApi>) => void;
}

export function renderInfoStep(options: InfoHarnessOptions = {}) {
  const api = createFakeBookingApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  installFakeFetch(api.fetch);
  options.before?.(api);
  const router = createMemoryRouter(
    [
      {
        element: <HarnessLayout />,
        children: [
          { path: BOOKING_INFO_PATH, element: <InfoRoute /> },
          { path: BOOKING_CONFIRM_PATH, element: <ConfirmProbe /> },
          // Đích của `Quay lại` và "Chọn lại dịch vụ": Bước 1 là trang khác của ứng dụng, ở đây chỉ cần biết đã tới
          { path: BOOKING_PATH, element: <p>Bước 1 của luồng đặt lịch</p> },
        ],
      },
    ],
    { initialEntries: [options.path ?? bookingInfoPath('5')] },
  );
  const view = render(<RouterProvider router={router} />);
  return { api, router, ...view };
}
