import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import {
  BOOKING_CONFIRM_PATH,
  BOOKING_INFO_PATH,
  BOOKING_PATH,
  bookingConfirmPath,
} from '../../../shared/routes/booking-paths';
import type { BookingDraft } from '../wizard/booking-draft-context';
import { ConfirmPanel } from '../wizard/confirm/confirm-panel';
import { createFakeBookingApi } from './fake-booking-api';
import { installFakeFetch } from './install-fake-fetch';
import { LocationProbe } from './location-probe';

// Dựng Bước 5 (`ConfirmPanel`) với API giả (booking F5): đường dẫn Bước 5, Bước 4 và Bước 1 thật, router dữ liệu thật (để test đọc `router.state`), nhưng KHÔNG có khung wizard, cổng A4,
// bản nháp thật và đăng nhập (đã có test ở F3, F4). Bản nháp là tham số; `active` (thay cho `usePageActive()`) là một đối tượng test chủ động đặt `current`; `onCreated` là hàm giả để test khẳng
// định có gọi, đúng một lần, với 201 đã kiểm. Chỉ test dùng; KHÔNG gọi backend thật. Đăng nhập (`setAuthState`) do test lo, vì `testing/` không import sâu vào `features/auth` (BWZ-08).
export const DEFAULT_DRAFT: BookingDraft = {
  khungGioId: '5',
  hoSoNguoiThanId: null,
  lyDoKham: null,
};

export interface ConfirmHarnessOptions {
  draft?: BookingDraft;
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi lời gọi
  before?: (api: ReturnType<typeof createFakeBookingApi>) => void;
}

export function renderConfirmPanel(options: ConfirmHarnessOptions = {}) {
  const api = createFakeBookingApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  installFakeFetch(api.fetch);
  options.before?.(api);

  const draft = options.draft ?? DEFAULT_DRAFT;
  const active = { current: true };
  const onCreated = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: BOOKING_CONFIRM_PATH,
        element: (
          <>
            <ConfirmPanel
              khungGioId={draft.khungGioId}
              draft={draft}
              active={active}
              onCreated={onCreated}
            />
            <LocationProbe />
          </>
        ),
      },
      // Đích của `Sửa` người khám, lý do khám, `Quay lại` và liên kết sửa lỗi hồ sơ: ở đây chỉ cần biết đã tới
      { path: BOOKING_INFO_PATH, element: <p>Bước 4 của luồng đặt lịch</p> },
      // Đích của "Chọn lại dịch vụ" và `Sửa` dịch vụ, bác sĩ, ngày giờ (tạm Bước 1)
      { path: BOOKING_PATH, element: <p>Bước 1 của luồng đặt lịch</p> },
    ],
    { initialEntries: [bookingConfirmPath(draft.khungGioId)] },
  );
  const view = render(<RouterProvider router={router} />);
  return { api, router, active, onCreated, ...view };
}
