import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import { AppointmentListPage } from '../appointments/patient/appointment-list-page';
import { LIST_TEXT } from '../appointments/patient/list-messages';
import {
  createFakeAppointmentListApi,
  type FakeRequest,
} from './fake-appointment-list-api';
import { LocationProbe } from './location-probe';

// Dựng trang "Lịch hẹn của tôi" với API giả (booking F1). Không có ở bộ xuất của module: chỉ test dùng. Hai route của Bệnh nhân (danh sách, người thân)
// phải gắn access token nên có hook xác thực giả; hai route công khai thì KHÔNG (test khẳng định ở LHL-20). KHÔNG gọi backend thật.
export interface ListHarnessOptions {
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi yêu cầu đầu tiên
  before?: (api: ReturnType<typeof createFakeAppointmentListApi>) => void;
}

// Đường dẫn trang lúc dựng, và chỗ test đọc URL hiện tại (LHL-19: bộ lọc không được lọt vào URL)
export const LIST_PATH = '/benh-nhan/lich-hen-cua-toi';

export const currentUrl = () => screen.getByTestId('url').textContent;

export function renderListPage(options: ListHarnessOptions = {}) {
  const api = createFakeAppointmentListApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  options.before?.(api);
  const view = render(
    <MemoryRouter initialEntries={[LIST_PATH]}>
      <AppointmentListPage />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { api, ...view };
}

export function cleanUpListPage() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setApiAuthHooks(null);
}

// Các truy vấn đã gửi tới danh sách, theo thứ tự (chỉ phần query)
export const listQueries = (api: { requests: FakeRequest[] }) =>
  api.requests
    .filter((request) => request.path === '/patient/appointments')
    .map((request) => request.query);

export const lastListQuery = (api: { requests: FakeRequest[] }) =>
  listQueries(api).at(-1);

export const searchBox = () =>
  screen.getByRole<HTMLInputElement>('textbox', {
    name: LIST_TEXT.searchLabel,
  });
export const typeSearch = (value: string) =>
  fireEvent.change(searchBox(), { target: { value } });

export const tab = (name: string | RegExp) =>
  screen.getByRole('button', { name });
export const field = (label: string) =>
  screen.getByLabelText<HTMLSelectElement | HTMLInputElement>(label);

// Chờ bảng đầu tiên hiện (lần tải đầu xong)
export const loaded = () =>
  screen.findByRole('region', { name: LIST_TEXT.resultsRegion });

// Mã lịch hẹn ở cột đầu của các dòng (bỏ hàng tiêu đề)
export const rowCodes = () =>
  within(screen.getByRole('region', { name: LIST_TEXT.resultsRegion }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => /CP\d+/.exec(row.textContent ?? '')?.[0]);

// Đồng hồ giả: bật SAU khi trang đã dựng (`findBy` và `waitFor` của Testing Library không chạy được dưới đồng hồ giả đầy đủ của Vitest). Chỉ giả
// `setTimeout` và `clearTimeout` (đủ cho hẹn giờ 300 ms của ô tìm và 15 giây của `request()`) để `setImmediate` và microtask thật vẫn chạy:
// `Response` giả đọc thân qua chúng.
declare function setImmediate(callback: () => void): void;
export const startFakeClock = () =>
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
export async function advanceClock(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    // Hai lượt nhường cho phản hồi giả về rồi React vẽ lại
    for (let turn = 0; turn < 2; turn += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
}
