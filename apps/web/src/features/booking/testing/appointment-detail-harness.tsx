import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  PATIENT_APPOINTMENT_DETAIL_ROUTE,
  PATIENT_APPOINTMENTS_PATH,
  patientAppointmentDetailPath,
} from '../../../shared/routes/booking-paths';
import { AppointmentDetailPage } from '../appointments/patient/detail/appointment-detail-page';
import {
  CANCEL_TEXT,
  DETAIL_TEXT,
} from '../appointments/patient/detail/detail-messages';
import { createFakeAppointmentDetailApi } from './fake-appointment-detail-api';
import { installFakeFetch } from './install-fake-fetch';
import { LocationProbe } from './location-probe';

// Dựng trang chi tiết lịch hẹn với API giả (booking F2). Không có ở bộ xuất của module: chỉ test dùng. Cả ba route của Bệnh nhân gắn access token nên có hook xác
// thực giả. KHÔNG gọi backend thật. `LIST_MARK` là chữ của trang đích giả khi bấm liên kết quay lại danh sách.
export const DETAIL_CODE = 'CP20261020001';
export const LIST_MARK = 'Trang danh sách giả';
export const DETAIL_API_PATH = `/patient/appointments/${DETAIL_CODE}`;
export const PREVIEW_API_PATH = `${DETAIL_API_PATH}/cancel-preview`;
export const CANCEL_API_PATH = `${DETAIL_API_PATH}/cancel`;

export interface DetailHarnessOptions {
  // Đường dẫn lúc dựng (mặc định: chi tiết của `DETAIL_CODE`)
  path?: string;
  // Phần tử thêm vào trong router (ví dụ liên kết để đổi mã lịch hẹn trên URL ở LCT-10)
  extra?: ReactNode;
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi yêu cầu đầu tiên
  before?: (api: ReturnType<typeof createFakeAppointmentDetailApi>) => void;
}

export function renderDetailPage(options: DetailHarnessOptions = {}) {
  const api = createFakeAppointmentDetailApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  installFakeFetch(api.fetch);
  options.before?.(api);
  const view = render(
    <MemoryRouter
      initialEntries={[
        options.path ?? patientAppointmentDetailPath(DETAIL_CODE),
      ]}
    >
      <Routes>
        <Route
          path={PATIENT_APPOINTMENT_DETAIL_ROUTE}
          element={<AppointmentDetailPage />}
        />
        <Route path={PATIENT_APPOINTMENTS_PATH} element={<p>{LIST_MARK}</p>} />
      </Routes>
      <LocationProbe />
      {options.extra}
    </MemoryRouter>,
  );
  return { api, ...view };
}

export function cleanUpDetailPage() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setApiAuthHooks(null);
}

export const currentUrl = () => screen.getByTestId('url').textContent;

// Chờ thẻ đầu hiện (lần tải chi tiết đầu xong)
export const detailLoaded = () =>
  screen.findByRole('region', { name: DETAIL_TEXT.summary });

export const cancelButton = () =>
  screen.queryByRole('button', { name: DETAIL_TEXT.cancelButton });

// Hộp huỷ nội tuyến: vùng có tên là tiêu đề (đổi thành "Đã hủy lịch hẹn." khi xong)
export const cancelBox = () =>
  screen.queryByRole('region', { name: CANCEL_TEXT.title });

export const keepButton = () =>
  screen.getByRole('button', { name: CANCEL_TEXT.keep });
export const confirmButton = () =>
  screen.getByRole('button', { name: /^(Xác nhận hủy|Đang hủy)/ });

// Bấm `Hủy lịch hẹn` rồi chờ xem trước xong (nút `Xác nhận hủy` bật)
export async function openCancelBox() {
  await detailLoaded();
  fireEvent.click(
    screen.getByRole('button', { name: DETAIL_TEXT.cancelButton }),
  );
  await screen.findByRole('region', { name: CANCEL_TEXT.title });
  await within(
    screen.getByRole('region', { name: CANCEL_TEXT.title }),
  ).findByText(CANCEL_TEXT.expectedRefund);
}

// Chạy phần việc async đang chờ (phản hồi giả về, React vẽ lại) mà không đổi đồng hồ
export async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

// Giữ một phản hồi cho tới khi test cho chạy tiếp (kiểm trạng thái "đang xem trước", "đang gửi", bấm đúp). `override` đưa vào `failNext`; `release()` gọi SAU khi
// lời gọi đã tới `fetch` giả (chờ `api.callsTo(...)` có mặt).
export function holdResponse(response: () => Response) {
  let resolveIt: (() => void) | null = null;
  return {
    override: () =>
      new Promise<Response>((resolve) => {
        resolveIt = () => resolve(response());
      }),
    release: () => {
      if (resolveIt === null) throw new Error('Lời gọi chưa tới fetch giả');
      resolveIt();
    },
  };
}
