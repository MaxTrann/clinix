import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  PATIENT_APPOINTMENT_DETAIL_ROUTE,
  PATIENT_APPOINTMENT_RESCHEDULE_CONFIRM_ROUTE,
  PATIENT_APPOINTMENT_RESCHEDULE_ROUTE,
  PATIENT_APPOINTMENTS_PATH,
  patientAppointmentReschedulePath,
} from '../../../shared/routes/booking-paths';
import { AppointmentDetailPage } from '../appointments/patient/detail/appointment-detail-page';
import { RescheduleConfirmPage } from '../appointments/patient/reschedule/reschedule-confirm-page';
import { ReschedulePage } from '../appointments/patient/reschedule/reschedule-page';
import { DETAIL_CODE, LIST_MARK } from './appointment-detail-harness';
import { createFakeRescheduleApi } from './fake-reschedule-api';
import { installFakeFetch } from './install-fake-fetch';
import { LocationProbe } from './location-probe';

// Dựng trang đổi lịch hẹn với API giả (reschedule F1). Không có ở bộ xuất của module: chỉ test dùng. Có đủ bốn route để thấy điều hướng: chi tiết, trang chọn khung giờ, màn xác nhận và
// danh sách (đích giả). Cả bốn route của Bệnh nhân gắn access token nên có hook xác thực giả. KHÔNG gọi backend thật.

export interface RescheduleHarnessOptions {
  // Đường dẫn lúc dựng (mặc định: trang chọn khung giờ của `DETAIL_CODE`)
  path?: string;
  // `location.state` của lần vào đầu tiên (reschedule F2: thông báo một lần sau khi gửi đi qua đây)
  state?: unknown;
  // Phần tử thêm vào trong router
  extra?: ReactNode;
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi yêu cầu đầu tiên
  before?: (api: ReturnType<typeof createFakeRescheduleApi>) => void;
}

export function renderReschedule(options: RescheduleHarnessOptions = {}) {
  const api = createFakeRescheduleApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  installFakeFetch(api.fetch);
  options.before?.(api);
  const [pathname, search = ''] = (
    options.path ?? patientAppointmentReschedulePath(DETAIL_CODE)
  ).split('?');
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
          path={PATIENT_APPOINTMENT_DETAIL_ROUTE}
          element={<AppointmentDetailPage />}
        />
        <Route
          path={PATIENT_APPOINTMENT_RESCHEDULE_ROUTE}
          element={<ReschedulePage />}
        />
        <Route
          path={PATIENT_APPOINTMENT_RESCHEDULE_CONFIRM_ROUTE}
          element={<RescheduleConfirmPage />}
        />
        <Route path={PATIENT_APPOINTMENTS_PATH} element={<p>{LIST_MARK}</p>} />
      </Routes>
      <LocationProbe />
      {options.extra}
    </MemoryRouter>,
  );
  return { api, ...view };
}
