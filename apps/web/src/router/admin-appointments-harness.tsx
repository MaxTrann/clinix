import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { setApiAuthHooks } from '../shared/api/auth-hooks';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import type { AuthUser, VaiTro } from '../features/auth';
import { LIST_TEXT } from '../features/booking/appointments/admin/list-messages';
import {
  createFakeAdminApi,
  makeAdminAppointment,
  makeAdminDetail,
  type FakeAdminScope,
} from '../features/booking/testing/fake-admin-api';
import type { FakeRequest } from '../features/booking/testing/fake-appointment-list-api';
import { createFakeAuthApi } from '../test/fake-auth-api';
import { createAppRoutes } from './routes';

// Dựng trang "Lịch hẹn" của Quản trị viên bằng ROUTER THẬT (booking F10): đủ khung `AdminLayout` (đọc `/admin/me`), `AdminScopeGuard`, `RequireAuth`, `lazy`, để trang đọc được `useAdminScope()` như
// ở bản chạy thật. Đặt ở `router/` (không ở `features/booking/testing/`) vì `architecture.test.ts` (BWZ-08) cấm `features/booking` import sâu vào `features/auth`, `features/admin`. API giả CHỈ cho các
// đường dẫn của Quản trị viên và các route công khai; mọi đường dẫn khác chuyển cho fake auth. Access token là chuỗi giả (test khẳng định route Admin có token, route công khai không). KHÔNG gọi backend thật.
export interface AdminHarnessOptions {
  scope?: FakeAdminScope;
  // Vai trò đăng nhập (mặc định Quản trị viên); các vai khác để thử cổng
  vaiTro?: VaiTro | null;
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi yêu cầu đầu tiên
  before?: (api: ReturnType<typeof createFakeAdminApi>) => void;
}

export function renderAdminAppointments(
  path: string,
  options: AdminHarnessOptions = {},
) {
  resetAuthForTest();
  const vaiTro = options.vaiTro === undefined ? 'QuanTriVien' : options.vaiTro;
  if (vaiTro === null) {
    setAuthState({ status: 'unauthenticated', user: null });
  } else {
    const user: AuthUser = {
      vaiTro,
      hoTen: `Họ tên ${vaiTro}`,
      daXacMinhEmail: true,
    };
    setAuthState({ status: 'authenticated', user });
  }
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
  const auth = createFakeAuthApi();
  const api = createFakeAdminApi(auth.fetch);
  if (options.scope !== undefined) api.scope = options.scope;
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  options.before?.(api);
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ['/', path],
    initialIndex: 1,
  });
  const view = render(<RouterProvider router={router} />);
  return { api, router, ...view };
}

export function cleanUpAdminAppointments() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setApiAuthHooks(null);
}

export const BRANCH_SCOPE: FakeAdminScope = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '3', ten: 'CLINIX Chi nhánh Quận 3' },
};

// Mã lịch mẫu mà các test chi tiết và override mở
export const ADMIN_CODE = 'CP20261018001';

// Các truy vấn đã gửi tới danh sách, theo thứ tự (chỉ phần query)
export const adminListQueries = (api: { requests: FakeRequest[] }) =>
  api.requests
    .filter((request) => request.path === '/admin/appointments')
    .map((request) => request.query);

export const lastAdminListQuery = (api: { requests: FakeRequest[] }) =>
  adminListQueries(api).at(-1);

export const searchBox = () =>
  screen.getByRole<HTMLInputElement>('textbox', {
    name: LIST_TEXT.searchLabel,
  });

export const field = (label: string) =>
  screen.getByLabelText<HTMLSelectElement | HTMLInputElement>(label);

// Chờ bảng đầu tiên hiện (lần tải đầu xong)
export const listLoaded = () =>
  screen.findByRole('region', { name: LIST_TEXT.resultsRegion });

// Mã lịch hẹn ở cột đầu của các dòng (bỏ hàng tiêu đề). Đọc ĐÚNG ô đầu: `textContent` cả hàng nối chữ các ô liền nhau
export const adminRowCodes = () =>
  within(screen.getByRole('region', { name: LIST_TEXT.resultsRegion }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent);

// Dựng trang chi tiết MỘT lịch (mở thẳng đường dẫn chi tiết) với chi tiết cho trước; chờ thẻ thông tin hiện
export async function openAdminDetail(
  detail: Parameters<typeof makeAdminDetail>[0] = {},
  options: AdminHarnessOptions = {},
) {
  const view = renderAdminAppointments(`/admin/lich-hen/${ADMIN_CODE}`, {
    ...options,
    before: (api) => {
      api.appointments = [makeAdminAppointment()];
      api.details[ADMIN_CODE] = makeAdminDetail(detail);
      options.before?.(api);
    },
  });
  await screen.findByRole('heading', { level: 2, name: 'Thông tin lịch hẹn' });
  return view;
}
