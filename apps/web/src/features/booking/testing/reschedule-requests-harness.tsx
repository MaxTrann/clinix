import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  RECEPTION_RESCHEDULE_REQUEST_DETAIL_ROUTE,
  RECEPTION_RESCHEDULE_REQUESTS_PATH,
} from '../../../shared/routes/booking-paths';
import { REQUEST_TEXT } from '../appointments/common/reschedule-requests/request-text';
import {
  ReceptionRescheduleRequestDetailRoute,
  ReceptionRescheduleRequestsPage,
} from '../appointments/reception/reschedule-requests/reception-requests-pages';
import type { FakeRequest } from './fake-appointment-list-api';
import { createFakeRescheduleRequestsApi } from './fake-reschedule-requests-api';
import { installFakeFetch } from './install-fake-fetch';
import { LocationProbe } from './location-probe';

// Dựng hai trang "Yêu cầu đổi lịch" của Lễ tân với API giả (reschedule F4). Không có ở bộ xuất của module: chỉ test dùng. Hai route (danh sách, chi tiết) như router thật; cả hai gắn access token nên có hook xác thực giả;
// route công khai `public/doctors` thì KHÔNG gắn. KHÔNG gọi backend thật. `makeApi` cho Pha B truyền API giả có thêm phần GHI (bọc bản đọc).
type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export type FakeRequestsApi = ReturnType<
  typeof createFakeRescheduleRequestsApi
>;

export interface RequestsHarnessOptions {
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi yêu cầu đầu tiên
  before?: (api: FakeRequestsApi) => void;
  // Mục lịch sử đầu tiên: mặc định là danh sách trơn. Đưa `search` (bộ lọc trên URL) hay `state.listSearch` (từ liên kết `Chi tiết`) để dựng đúng lúc vào trang
  entry?: string | { pathname: string; search?: string; state?: unknown };
  makeApi?: (delegate: FetchLike) => FakeRequestsApi;
  // Phần tử thêm trong router (ví dụ trang đích giả)
  extra?: ReactNode;
}

export const currentUrl = () => screen.getByTestId('url').textContent;

export function renderRequests(options: RequestsHarnessOptions = {}) {
  const api = (options.makeApi ?? createFakeRescheduleRequestsApi)(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  installFakeFetch(api.fetch);
  options.before?.(api);
  const view = render(
    <MemoryRouter
      initialEntries={[options.entry ?? RECEPTION_RESCHEDULE_REQUESTS_PATH]}
    >
      <Routes>
        <Route
          path={RECEPTION_RESCHEDULE_REQUESTS_PATH}
          element={<ReceptionRescheduleRequestsPage />}
        />
        <Route
          path={RECEPTION_RESCHEDULE_REQUEST_DETAIL_ROUTE}
          element={<ReceptionRescheduleRequestDetailRoute />}
        />
      </Routes>
      <LocationProbe />
      {options.extra}
    </MemoryRouter>,
  );
  return { api, ...view };
}

export function cleanUpRequestsPage() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setApiAuthHooks(null);
}

const LIST_API_PATH = '/reception/reschedule-requests';

// Các truy vấn đã gửi tới danh sách, theo thứ tự (chỉ phần query)
export const listQueries = (api: { requests: FakeRequest[] }) =>
  api.requests
    .filter((request) => request.path === LIST_API_PATH)
    .map((request) => request.query);

export const lastListQuery = (api: { requests: FakeRequest[] }) =>
  listQueries(api).at(-1);

// Các lời gọi chi tiết (đường dẫn con của danh sách)
export const detailCalls = (api: { requests: FakeRequest[] }) =>
  api.requests.filter(
    (request) =>
      request.path.startsWith(`${LIST_API_PATH}/`) && request.method === 'GET',
  );

export const searchBox = () =>
  screen.getByRole<HTMLInputElement>('textbox', {
    name: REQUEST_TEXT.searchLabel,
  });
export const typeCode = (value: string) =>
  fireEvent.change(searchBox(), { target: { value } });
export const submitSearch = () =>
  fireEvent.click(
    screen.getByRole('button', { name: REQUEST_TEXT.searchButton }),
  );

export const tabButton = (name: string) => screen.getByRole('button', { name });
export const doctorSelect = () =>
  screen.getByRole<HTMLSelectElement>('combobox', {
    name: REQUEST_TEXT.doctorLabel,
  });

// Chờ bảng đầu tiên hiện (lần tải đầu xong)
export const loaded = () =>
  screen.findByRole('region', { name: REQUEST_TEXT.resultsRegion });

// Mã lịch hẹn ở cột đầu của các dòng (bỏ hàng tiêu đề). Đọc ĐÚNG ô đầu: `textContent` cả hàng nối chữ các ô liền nhau
export const rowCodes = () =>
  within(screen.getByRole('region', { name: REQUEST_TEXT.resultsRegion }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent);

// Liên kết `Chi tiết` của hàng có mã `maLichHen` (tên truy cập có kèm mã)
export const detailLink = (maLichHen: string) =>
  screen.getByRole('link', {
    name: `${REQUEST_TEXT.detail} yêu cầu của lịch hẹn ${maLichHen}`,
  });

// Danh sách bác sĩ công khai mẫu cho ô lọc
export const DOCTORS = {
  items: [
    { bacSiId: '5', hoTen: 'Nguyễn Minh Anh' },
    { bacSiId: '9', hoTen: 'Lê Thảo Vy' },
  ],
  total: 2,
  page: 1,
  pageSize: 100,
};
