import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createFakeAuthApi } from '../../../test/fake-auth-api';
import { ROLE_HOME_PATHS } from '../../auth';
import { resetAuthForTest, restoreSession } from '../../auth/auth-session';
import { LOOKUP_TEXT } from '../lookup/lookup-messages';
import { LOOKUP_DEBOUNCE_MS } from '../lookup/use-patient-search';
import { ReceptionLookupPage } from '../pages/reception-lookup-page';
import { RECEPTION_LOOKUP_SEGMENT, RECEPTION_PATHS } from '../patient-paths';
import { ReceptionLayout } from '../shell/reception-layout';
import {
  SAMPLE_PATIENTS,
  createFakeLookupApi,
  type FakePatient,
} from './fake-lookup-api';

// Dựng trang "Tra cứu bệnh nhân" với phiên Lễ tân thật (qua fake auth) và hai API tra cứu giả (patient F8; dùng chung cho các file test của
// trang). Không có ở bộ xuất của module: chỉ test dùng. Không sửa `profile-page-harness.tsx` hay `fake-profile-api.ts` của F3, F4.
export async function setUpLookupApi(
  patients: FakePatient[] = SAMPLE_PATIENTS,
) {
  resetAuthForTest();
  const auth = createFakeAuthApi({
    vaiTro: 'LeTan',
    hoTen: 'Lễ tân mẫu',
    daXacMinhEmail: true,
  });
  const lookup = createFakeLookupApi(auth.fetch, patients);
  vi.stubGlobal('fetch', vi.fn(lookup.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  auth.startSession();
  await restoreSession();
  return { auth, lookup };
}

export interface LookupHarnessOptions {
  patients?: FakePatient[];
  // Chạy sau khi phiên đã đăng nhập và trước khi render: để giữ, làm lỗi yêu cầu đầu tiên
  before?: (api: Awaited<ReturnType<typeof setUpLookupApi>>) => void;
  // true: bọc trong khung Lễ tân thật (có thanh bên, thanh trên). Mặc định false: render trang trực tiếp
  withLayout?: boolean;
}

export async function renderLookupPage(options: LookupHarnessOptions = {}) {
  const api = await setUpLookupApi(options.patients);
  options.before?.(api);

  const page = <ReceptionLookupPage />;
  const router = createMemoryRouter(
    options.withLayout
      ? [
          {
            path: ROLE_HOME_PATHS.LeTan,
            element: <ReceptionLayout items={[]} />,
            children: [{ path: RECEPTION_LOOKUP_SEGMENT, element: page }],
          },
        ]
      : [{ path: RECEPTION_PATHS.lookup, element: page }],
    { initialEntries: [RECEPTION_PATHS.lookup] },
  );
  const view = render(<RouterProvider router={router} />);
  return { ...api, router, ...view };
}

export const searchBox = () =>
  screen.getByRole<HTMLInputElement>('textbox', {
    name: LOOKUP_TEXT.searchLabel,
  });
export const clearButton = () =>
  screen.getByRole('button', { name: LOOKUP_TEXT.clearSearch });

// Gõ vào ô tìm như người dùng (đổi giá trị, không qua form)
export const typeSearch = (value: string) =>
  fireEvent.change(searchBox(), { target: { value } });

// Đồng hồ giả: bật SAU khi trang đã dựng (findBy và waitFor của Testing Library không chạy được dưới đồng hồ giả đầy đủ của Vitest). Chỉ giả
// `setTimeout` và `clearTimeout` (đủ cho hẹn giờ 300 ms và 15 giây của `request()`), để `setImmediate` và microtask thật vẫn chạy: luồng đọc
// thân của `Response` giả cần chúng. `advance` đẩy đồng hồ rồi nhường hai lượt cho phản hồi giả về.
declare function setImmediate(callback: () => void): void;
export const nextTick = () =>
  new Promise<void>((resolve) => setImmediate(resolve));
export const startFakeClock = () =>
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
export async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await nextTick();
    await nextTick();
  });
}
// Đợi đủ 300 ms ngừng gõ rồi để phản hồi giả về
export const settleSearch = () => advance(LOOKUP_DEBOUNCE_MS);

// Gõ rồi đợi kết quả hiện (dùng đồng hồ giả)
export async function searchFor(value: string) {
  typeSearch(value);
  await settleSearch();
}

// Danh sách kết quả: các nút hàng (không tính nút "Xóa tìm kiếm", "Trước", "Sau")
export const resultRows = () =>
  Array.from(
    screen
      .getByRole('region', { name: LOOKUP_TEXT.resultsRegion })
      .querySelectorAll<HTMLButtonElement>('ul button'),
  );
export const resultRow = (name: string | RegExp) =>
  screen.getByRole('button', { name });
