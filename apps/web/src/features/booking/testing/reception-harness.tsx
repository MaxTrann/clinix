import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import { RECEPTION_APPOINTMENTS_PATH } from '../../../shared/routes/booking-paths';
import { LIST_TEXT } from '../appointments/reception/list-messages';
import { ReceptionListPage } from '../appointments/reception/reception-list-page';
import type { FakeRequest } from './fake-appointment-list-api';
import { createFakeReceptionApi } from './fake-reception-api';
import { LocationProbe } from './location-probe';

// Dựng trang "Quản lý lịch hẹn" của Lễ tân với API giả (booking F8). Không có ở bộ xuất của module: chỉ test dùng. Hai route của Lễ tân (danh sách, chi tiết) phải gắn access
// token nên có hook xác thực giả; hai route công khai thì KHÔNG (test khẳng định ở LTL-13). KHÔNG gọi backend thật. Đồng hồ giả: dùng `startFakeClock` và `advanceClock` của
// `appointment-list-harness.tsx` (cùng cách, không chép lại).
export interface ReceptionHarnessOptions {
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi yêu cầu đầu tiên
  before?: (api: ReturnType<typeof createFakeReceptionApi>) => void;
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
    <MemoryRouter initialEntries={[RECEPTION_APPOINTMENTS_PATH]}>
      <ReceptionListPage />
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

// Nút `Chi tiết` của hàng có mã `maLichHen` (tên truy cập có kèm mã)
export const detailButton = (maLichHen: string) =>
  screen.getByRole('button', {
    name: `${LIST_TEXT.detail} lịch hẹn ${maLichHen}`,
  });
