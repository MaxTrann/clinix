import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  RECEPTION_APPOINTMENT_DETAIL_ROUTE,
  RECEPTION_APPOINTMENT_RESCHEDULE_CONFIRM_ROUTE,
  RECEPTION_APPOINTMENT_RESCHEDULE_ROUTE,
  RECEPTION_APPOINTMENTS_PATH,
} from '../../../shared/routes/booking-paths';
import { ReceptionDetailRoute } from '../appointments/reception/detail/reception-detail-page';
import { ReceptionRescheduleConfirmPage } from '../appointments/reception/reschedule/reception-reschedule-confirm-page';
import { ReceptionReschedulePage } from '../appointments/reception/reschedule/reception-reschedule-page';
import { LIST_MARK } from './appointment-detail-harness';
import { makeReceptionDetail } from './fake-reception-api';
import { createFakeReceptionRescheduleApi } from './fake-reception-reschedule-api';
import { installFakeFetch } from './install-fake-fetch';
import { LocationProbe } from './location-probe';
import { GRID_PATH, RECEPTION_CODE } from './reception-reschedule-helpers';

// Dựng ba trang của Lễ tân ĐỔI LỊCH HỘ với API giả (reschedule F3). Không có ở bộ xuất của module: chỉ test dùng. Có đủ bốn route để thấy điều hướng: chi tiết, trang chọn khung giờ, màn xác nhận và danh
// sách (đích giả). Mọi route của Lễ tân gắn access token nên có hook xác thực giả (`installFakeFetch`). Gỡ bằng `cleanUpReceptionPage` của `reception-harness`. KHÔNG gọi backend thật.
// Mã, đường dẫn và tìm phần tử dùng chung nằm ở `reception-reschedule-helpers.ts`.

export interface ReceptionRescheduleHarnessOptions {
  // Đường dẫn lúc dựng (mặc định: trang chọn khung giờ của `RECEPTION_CODE`)
  path?: string;
  // `location.state` của lần vào đầu tiên (thông báo một lần đi qua đây)
  state?: unknown;
  // Phần tử thêm vào trong router
  extra?: ReactNode;
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi yêu cầu đầu tiên
  before?: (api: ReturnType<typeof createFakeReceptionRescheduleApi>) => void;
}

export function renderReceptionReschedule(
  options: ReceptionRescheduleHarnessOptions = {},
) {
  const api = createFakeReceptionRescheduleApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  api.reception.details[RECEPTION_CODE] = makeReceptionDetail();
  installFakeFetch(api.fetch);
  options.before?.(api);
  const [pathname, search = ''] = (options.path ?? GRID_PATH).split('?');
  const view = render(
    <MemoryRouter
      initialEntries={[
        {
          pathname,
          search: search === '' ? '' : `?${search}`,
          state: options.state,
        },
      ]}
    >
      <Routes>
        <Route
          path={RECEPTION_APPOINTMENT_DETAIL_ROUTE}
          element={<ReceptionDetailRoute />}
        />
        <Route
          path={RECEPTION_APPOINTMENT_RESCHEDULE_ROUTE}
          element={<ReceptionReschedulePage />}
        />
        <Route
          path={RECEPTION_APPOINTMENT_RESCHEDULE_CONFIRM_ROUTE}
          element={<ReceptionRescheduleConfirmPage />}
        />
        <Route
          path={RECEPTION_APPOINTMENTS_PATH}
          element={<p>{LIST_MARK}</p>}
        />
      </Routes>
      <LocationProbe />
      {options.extra}
    </MemoryRouter>,
  );
  return { api, ...view };
}
