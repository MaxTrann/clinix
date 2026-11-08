import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { AdminProfilePage } from '../pages/admin-profile-page';
import { ADMIN_PATHS } from '../patient-paths';
import type { AdminScope } from '../profile/profile-types';
import {
  SAMPLE_ADMIN,
  SAMPLE_ADMIN_BRANCH,
  json,
  type FakeProfileData,
} from './fake-profile-api';
import { setUpApi, type HarnessOptions } from './profile-page-harness';

// Dựng trang "Thông tin cá nhân" của Quản trị viên (patient F5) với phiên `QuanTriVien` thật (qua fake auth), `/api/profile` giả và
// `/api/admin/me` giả theo phạm vi. Mặc định dựng bằng `createAppRoutes()` THẬT nên có khung Admin thật (thanh bên, mục menu, cổng vai trò);
// `withLayout: false` render trang trực tiếp. Không có ở bộ xuất của module: chỉ test dùng.
// Ô, nút của form sửa dùng lại bộ chọn của `profile-page-harness.tsx` (cùng form, cùng tên).
export const ADMIN_BRANCH_NAME = 'CLINIX Chi nhánh Quận 3';

export interface AdminHarnessOptions {
  // Phạm vi của tài khoản mẫu: chọn hồ sơ mẫu và phản hồi của `/admin/me`. Mặc định Toàn hệ thống
  scope?: AdminScope;
  // Ghi đè các khoá của hồ sơ mẫu (SAMPLE_ADMIN hoặc SAMPLE_ADMIN_BRANCH)
  initial?: Partial<FakeProfileData>;
  // Chạy sau khi phiên đã đăng nhập và trước khi render: để giữ, làm lỗi hoặc bật đồng hồ giả cho yêu cầu đầu tiên
  before?: HarnessOptions['before'];
  // false: render trang trực tiếp, không bọc khung Admin (khung gỡ trang đi khi phiên bị xoá, che mất hành vi của chính trang)
  withLayout?: boolean;
  // Đường dẫn mở đầu khi có khung; mặc định trang hồ sơ
  path?: string;
}

export async function renderAdminProfilePage(
  options: AdminHarnessOptions = {},
) {
  const scope = options.scope ?? 'ToanHeThong';
  const sample = scope === 'ChiNhanh' ? SAMPLE_ADMIN_BRANCH : SAMPLE_ADMIN;
  const api = await setUpApi(
    { ...sample, ...options.initial },
    [],
    'QuanTriVien',
  );
  // `/api/admin/me` đúng dạng `admin-me.ts`; mọi đường dẫn khác chuyển cho hàm giả của hồ sơ. Đếm số lần gọi để test kiểm "không gọi thêm".
  const adminMe = { calls: 0 };
  const adminMeBody =
    scope === 'ChiNhanh'
      ? { phamVi: 'ChiNhanh', chiNhanh: { id: '3', ten: ADMIN_BRANCH_NAME } }
      : { phamVi: 'ToanHeThong' };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).split('?')[0] === '/api/admin/me') {
        adminMe.calls += 1;
        return Promise.resolve(json(200, adminMeBody));
      }
      return api.profile.fetch(input, init);
    }),
  );
  options.before?.(api);

  const router =
    options.withLayout === false
      ? createMemoryRouter(
          [{ path: ADMIN_PATHS.profile, element: <AdminProfilePage /> }],
          { initialEntries: [ADMIN_PATHS.profile] },
        )
      : createMemoryRouter(createAppRoutes(), {
          initialEntries: [options.path ?? ADMIN_PATHS.profile],
        });
  const view = render(<RouterProvider router={router} />);
  return { ...api, adminMe, router, ...view };
}

// Thanh bên Admin (thẻ người dùng, menu, đăng xuất)
export const adminSidebar = () =>
  screen.findByRole('complementary', { name: 'Điều hướng Admin' });
