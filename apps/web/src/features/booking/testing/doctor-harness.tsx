import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, Outlet } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  DOCTOR_APPOINTMENTS_PATH,
  doctorAppointmentDetailPath,
} from '../../../shared/routes/booking-paths';
import { DOCTOR_APPOINTMENT_ROUTES } from '../appointments/doctor/doctor-appointment-routes';
import { LIST_TEXT } from '../appointments/doctor/list-messages';
import {
  createFakeDoctorApi,
  DOCTOR_CODE,
  makeDoctorAppointment,
  makeDoctorDetail,
} from './fake-doctor-api';
import type { FakeRequest } from './fake-appointment-list-api';
import { LocationProbe } from './location-probe';

// Dựng trang "Lịch hẹn" của Bác sĩ với API giả (booking F11). Mảng route của module (`DOCTOR_APPOINTMENT_ROUTES`, route `lazy` thật) đặt dưới `/bac-si-portal`, KHÔNG có khung và cổng vai (do `router/` bọc: ca
// DAR kiểm bằng router thật ở `router/doctor-appointments-route.test.tsx`). Hai route của Bác sĩ phải gắn access token nên có hook xác thực giả. KHÔNG gọi backend thật. Đồng hồ giả: dùng `startFakeClock`
// và `advanceClock` của `appointment-list-harness.tsx` (cùng cách, không chép lại).
export interface DoctorHarnessOptions {
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi yêu cầu đầu tiên
  before?: (api: ReturnType<typeof createFakeDoctorApi>) => void;
}

export const currentUrl = () => screen.getByTestId('url').textContent;

export function renderDoctorAppointments(
  path: string = DOCTOR_APPOINTMENTS_PATH,
  options: DoctorHarnessOptions = {},
) {
  const api = createFakeDoctorApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  options.before?.(api);
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <LocationProbe />
          </>
        ),
        children: [
          { path: '/bac-si-portal', children: DOCTOR_APPOINTMENT_ROUTES },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  const view = render(<RouterProvider router={router} />);
  return { api, router, ...view };
}

export function cleanUpDoctorAppointments() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setApiAuthHooks(null);
}

// Các truy vấn đã gửi tới danh sách, theo thứ tự (chỉ phần query)
export const doctorListQueries = (api: { requests: FakeRequest[] }) =>
  api.requests
    .filter((request) => request.path === '/doctor/appointments')
    .map((request) => request.query);

export const lastDoctorListQuery = (api: { requests: FakeRequest[] }) =>
  doctorListQueries(api).at(-1);

export const searchBox = () =>
  screen.getByRole<HTMLInputElement>('textbox', {
    name: LIST_TEXT.searchLabel,
  });
export const typeSearch = (value: string) =>
  fireEvent.change(searchBox(), { target: { value } });

export const chip = (name: string) => screen.getByRole('button', { name });
export const select = (name: string) =>
  screen.getByRole<HTMLSelectElement>('combobox', { name });
export const dateInput = (label: string) =>
  screen.getByLabelText<HTMLInputElement>(label);

// Chờ bảng đầu tiên hiện (lần tải đầu xong)
export const loaded = () =>
  screen.findByRole('region', { name: LIST_TEXT.resultsRegion });

// Mã lịch hẹn ở cột đầu của các dòng (bỏ hàng tiêu đề). Đọc ĐÚNG ô đầu: `textContent` cả hàng nối chữ các ô liền nhau; ô đầu có ba dòng (ngày, giờ, mã) nên lấy dòng cuối
export const rowCodes = () =>
  within(screen.getByRole('region', { name: LIST_TEXT.resultsRegion }))
    .getAllByRole('row')
    .slice(1)
    .map(
      (row) =>
        within(row).getAllByRole('cell')[0].querySelectorAll('p')[2]
          ?.textContent,
    );

// Liên kết `Chi tiết` của hàng có mã `maLichHen` (tên truy cập có kèm mã)
export const detailLink = (maLichHen: string) =>
  screen.getByRole('link', {
    name: `${LIST_TEXT.detail} lịch hẹn ${maLichHen}`,
  });

// Dựng thẳng trang chi tiết MỘT ca khám (mở đường dẫn chi tiết) với chi tiết cho trước; chờ thẻ thông tin hiện
export async function openDoctorDetail(
  detail: Parameters<typeof makeDoctorDetail>[0] = {},
  options: DoctorHarnessOptions = {},
  code: string = DOCTOR_CODE,
) {
  const view = renderDoctorAppointments(doctorAppointmentDetailPath(code), {
    before: (api) => {
      api.appointments = [makeDoctorAppointment({ maLichHen: code })];
      api.details[code] = makeDoctorDetail({ maLichHen: code, ...detail });
      options.before?.(api);
    },
  });
  await screen.findByRole('heading', { level: 2, name: 'Thông tin lịch hẹn' });
  return view;
}
