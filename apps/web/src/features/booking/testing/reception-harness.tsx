import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  RECEPTION_APPOINTMENT_DETAIL_ROUTE,
  RECEPTION_APPOINTMENTS_PATH,
  receptionAppointmentDetailPath,
} from '../../../shared/routes/booking-paths';
import type { ReceptionAppointmentDetail } from '../appointments/reception/api/reception-appointment-types';
import { DETAIL_TEXT } from '../appointments/reception/detail/detail-messages';
import { ReceptionDetailRoute } from '../appointments/reception/detail/reception-detail-page';
import { LIST_TEXT } from '../appointments/reception/list-messages';
import { ReceptionListPage } from '../appointments/reception/reception-list-page';
import type { FakeRequest } from './fake-appointment-list-api';
import {
  createFakeReceptionApi,
  makeReceptionAppointment,
  makeReceptionDetail,
} from './fake-reception-api';
import { LocationProbe } from './location-probe';

// Dựng hai trang của Lễ tân với API giả (booking F8; F12b: chi tiết là TRANG, nên harness có CẢ HAI route như router thật: danh sách và chi tiết). Không có ở bộ xuất của module: chỉ test
// dùng. Hai route của Lễ tân (danh sách, chi tiết) phải gắn access token nên có hook xác thực giả; hai route công khai thì KHÔNG (test khẳng định ở LTL-13). KHÔNG gọi backend thật.
// Đồng hồ giả: dùng `startFakeClock` và `advanceClock` của `appointment-list-harness.tsx` (cùng cách, không chép lại).
export interface ReceptionHarnessOptions {
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi yêu cầu đầu tiên
  before?: (api: ReturnType<typeof createFakeReceptionApi>) => void;
  // Mục lịch sử đầu tiên: mặc định là danh sách trơn. Đưa `search` (bộ lọc trên URL) hay `state.listSearch` (từ nút `Chi tiết`) để dựng đúng lúc vào trang
  entry?: string | { pathname: string; search?: string; state?: unknown };
}

export const currentUrl = () => screen.getByTestId('url').textContent;

export function renderReceptionPage(options: ReceptionHarnessOptions = {}) {
  const api = createFakeReceptionApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  options.before?.(api);
  const view = render(
    <MemoryRouter
      initialEntries={[options.entry ?? RECEPTION_APPOINTMENTS_PATH]}
    >
      <Routes>
        <Route
          path={RECEPTION_APPOINTMENTS_PATH}
          element={<ReceptionListPage />}
        />
        <Route
          path={RECEPTION_APPOINTMENT_DETAIL_ROUTE}
          element={<ReceptionDetailRoute />}
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { api, ...view };
}

export function cleanUpReceptionPage() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setApiAuthHooks(null);
}

// Các truy vấn đã gửi tới danh sách, theo thứ tự (chỉ phần query)
export const listQueries = (api: { requests: FakeRequest[] }) =>
  api.requests
    .filter((request) => request.path === '/reception/appointments')
    .map((request) => request.query);

export const lastListQuery = (api: { requests: FakeRequest[] }) =>
  listQueries(api).at(-1);

export const searchBox = () =>
  screen.getByRole<HTMLInputElement>('textbox', {
    name: LIST_TEXT.searchLabel,
  });
export const typeSearch = (value: string) =>
  fireEvent.change(searchBox(), { target: { value } });

export const chip = (name: string) => screen.getByRole('button', { name });
export const select = (name: string) =>
  screen.getByRole<HTMLSelectElement>('combobox', { name });

// Chờ bảng đầu tiên hiện (lần tải đầu xong)
export const loaded = () =>
  screen.findByRole('region', { name: LIST_TEXT.resultsRegion });

// Mã lịch hẹn ở cột đầu của các dòng (bỏ hàng tiêu đề). Đọc ĐÚNG ô đầu: `textContent` cả hàng nối chữ các ô liền nhau ("CP…001" rồi "08:00")
export const rowCodes = () =>
  within(screen.getByRole('region', { name: LIST_TEXT.resultsRegion }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent);

// Liên kết `Chi tiết` của hàng có mã `maLichHen` (tên truy cập có kèm mã). F12b: là LIÊN KẾT tới trang chi tiết (F8, F9: nút mở ngăn)
export const detailLink = (maLichHen: string) =>
  screen.getByRole('link', {
    name: `${LIST_TEXT.detail} lịch hẹn ${maLichHen}`,
  });

// Mã của lịch mẫu mà các test thao tác (F9) mở
export const RECEPTION_CODE = 'CP20261018001';

// Dựng trang CHI TIẾT với MỘT lịch và chi tiết cho trước, vào thẳng đường dẫn chi tiết (booking F9 mở ngăn từ nút `Chi tiết`; F12b: trang; dùng chung cho các test thao tác của Lễ tân). `before` chạy sau
// khi dữ liệu mẫu đã đặt. `page` là khung chứa nội dung trang (không gồm hộp thoại, vì hộp dựng ở `document.body` bằng portal): `within(page)` thay `within(drawer)` của F9.
export async function openReceptionDetail(
  detail: Partial<ReceptionAppointmentDetail> = {},
  before?: (api: ReturnType<typeof createFakeReceptionApi>) => void,
  entry?: ReceptionHarnessOptions['entry'],
) {
  const view = renderReceptionPage({
    before: (api) => {
      api.appointments = [makeReceptionAppointment()];
      api.details[RECEPTION_CODE] = makeReceptionDetail(detail);
      before?.(api);
    },
    entry: entry ?? receptionAppointmentDetailPath(RECEPTION_CODE),
  });
  await screen.findByRole('heading', { name: DETAIL_TEXT.sections.patient });
  return { ...view, page: view.container };
}
