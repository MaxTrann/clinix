import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { AuthUser, VaiTro } from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import { ADMIN_REQUEST_TEXT } from '../features/booking/appointments/admin/reschedule-requests/admin-requests-text';
import type { FakeAdminScope } from '../features/booking/testing/fake-admin-api';
import {
  createFakeAdminRescheduleRequestsApi,
  type FakeAdminRequestsApi,
  type FakeBranch,
} from '../features/booking/testing/fake-admin-reschedule-requests-api';
import { fakeRecord } from '../features/booking/testing/fake-reschedule-requests-api';
import { makeRequestDetail } from '../features/booking/testing/reschedule-requests-fixtures';
import { setApiAuthHooks } from '../shared/api/auth-hooks';
import { ADMIN_RESCHEDULE_REQUESTS_PATH } from '../shared/routes/booking-paths';
import { createFakeAuthApi } from '../test/fake-auth-api';
import { createAppRoutes } from './routes';

// Dựng tab "Yêu cầu đổi lịch" của trang "Duyệt yêu cầu" bằng ROUTER THẬT (reschedule F5): đủ khung `AdminLayout` (đọc `/admin/me`), `AdminScopeGuard`, trang host của doctor, route con của booking và `lazy`, để
// trang đọc được phạm vi chi nhánh như ở bản chạy thật. Đặt ở `router/` (không ở `features/booking/testing/`) vì BWZ-08 cấm `features/booking` import sâu `features/auth`, `features/admin` (nếp
// `admin-appointments-harness.tsx`). API giả cho đường dẫn của Quản trị viên và các route công khai; mọi đường dẫn khác chuyển cho fake auth. Access token là chuỗi giả. KHÔNG gọi backend thật.
export const BRANCHES: readonly FakeBranch[] = [
  { chiNhanhId: '3', ten: 'CLINIX Chi nhánh Quận 3' },
  { chiNhanhId: '4', ten: 'CLINIX Chi nhánh Quận 4' },
];

export const BRANCH_SCOPE: FakeAdminScope = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '3', ten: 'CLINIX Chi nhánh Quận 3' },
};

// Mã lịch mẫu của hai yêu cầu ở hai chi nhánh
export const CODE_A = 'CLX-20261120-7K3M9';
export const CODE_B = 'CLX-20261120-8M4N2';

// Một yêu cầu đang chờ ở chi nhánh cho trước
export const requestAt = (
  chiNhanhId: string,
  overrides: Parameters<typeof makeRequestDetail>[0] = {},
) => {
  const branch = BRANCHES.find((item) => item.chiNhanhId === chiNhanhId);
  return fakeRecord(
    makeRequestDetail({
      chiNhanh: {
        id: chiNhanhId,
        ten: branch?.ten ?? `Chi nhánh ${chiNhanhId}`,
      },
      ...overrides,
    }),
  );
};

export interface AdminRequestsHarnessOptions {
  scope?: FakeAdminScope;
  // Vai trò đăng nhập (mặc định Quản trị viên); `null` ⇒ chưa đăng nhập
  vaiTro?: VaiTro | null;
  // Chạy sau khi API giả đã có và trước khi render: đặt dữ liệu, giữ hay làm lỗi yêu cầu đầu tiên
  before?: (api: FakeAdminRequestsApi) => void;
}

export function renderAdminRequests(
  entry:
    | string
    | { pathname: string; search?: string } = ADMIN_RESCHEDULE_REQUESTS_PATH,
  options: AdminRequestsHarnessOptions = {},
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
  const api = createFakeAdminRescheduleRequestsApi(auth.fetch);
  api.branches = [...BRANCHES];
  api.records = [
    requestAt('3', { yeuCauId: '101', maLichHen: CODE_A }),
    requestAt('4', { yeuCauId: '102', maLichHen: CODE_B }),
  ];
  if (options.scope !== undefined) api.scope = options.scope;
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  options.before?.(api);
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ['/', entry],
    initialIndex: 1,
  });
  const view = render(<RouterProvider router={router} />);
  return { api, router, ...view };
}

export function cleanUpAdminRequests() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setApiAuthHooks(null);
}

export const branchSelect = () =>
  screen.getByRole<HTMLSelectElement>('combobox', {
    name: ADMIN_REQUEST_TEXT.branchLabel,
  });

export const tabsNav = () =>
  screen.getByRole('navigation', { name: 'Loại yêu cầu' });
