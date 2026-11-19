import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { apiError, createFakeAuthApi } from '../../../test/fake-auth-api';
import { resetAuthForTest, restoreSession } from '../../auth/auth-session';
import { FULL_CONFIG } from './testing/system-config-test-kit';

// admin F5, phân quyền phía giao diện (PLAN CH-09 phía giao diện; mã CHF5-50 đến CHF5-53 là [đề xuất], TRACKING admin 9A.8 mục 3).
// Dựng cả khung `AdminLayout`, `AdminScopeGuard` và `RequireAuth` thật với API xác thực giả; API cấu hình chỉ được trả qua `failNext`.

const CONFIG_URL = '/admin/system-config';
const PAGE_PATH = '/admin/cai-dat-he-thong';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderApp(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

let api: ReturnType<typeof createFakeAuthApi>;

function startAs(vaiTro: 'QuanTriVien' | 'LeTan' | 'BacSi' | 'BenhNhan') {
  resetAuthForTest();
  api = createFakeAuthApi({
    vaiTro,
    hoTen: 'Người dùng thử',
    daXacMinhEmail: true,
  });
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  api.startSession();
  return restoreSession();
}

const configCalls = () =>
  api.requests.filter((request) => request.path.startsWith(CONFIG_URL));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CHF5-50 Quản trị viên Toàn hệ thống: có mục menu và mở được trang', () => {
  it('CHF5-50 mục "Cài đặt hệ thống" là liên kết tới /admin/cai-dat-he-thong; bấm vào thì mở màn và tải cấu hình', async () => {
    await startAs('QuanTriVien');
    api.failNext('/admin/me', () => response({ phamVi: 'ToanHeThong' }));
    api.failNext(CONFIG_URL, () => response(FULL_CONFIG));
    const router = renderApp('/admin');

    const link = await screen.findByRole('link', { name: 'Cài đặt hệ thống' });
    expect(link).toHaveAttribute('href', PAGE_PATH);
    fireEvent.click(link);

    expect(
      await screen.findByRole('heading', {
        name: 'Cài đặt hệ thống',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText(/Thời hạn giữ chỗ/)).toHaveValue('15');
    expect(router.state.location.pathname).toBe(PAGE_PATH);
    expect(configCalls()).toHaveLength(1);
    expect(configCalls()[0].method).toBe('GET');
  });

  it('CHF5-50 mở thẳng đường dẫn cũng vào được', async () => {
    await startAs('QuanTriVien');
    api.failNext('/admin/me', () => response({ phamVi: 'ToanHeThong' }));
    api.failNext(CONFIG_URL, () => response(FULL_CONFIG));
    renderApp(PAGE_PATH);
    expect(
      await screen.findByLabelText(/Thời hạn giữ chỗ/),
    ).toBeInTheDocument();
  });
});

describe('CHF5-51 Quản trị viên Chi nhánh: không có mục, vào thẳng đường dẫn thì "Không đủ quyền" (CH-09)', () => {
  it('CHF5-51 mục menu ẩn; mở thẳng đường dẫn hiện trang "Không đủ quyền truy cập" và KHÔNG gọi API cấu hình nào', async () => {
    await startAs('QuanTriVien');
    api.failNext('/admin/me', () =>
      response({
        phamVi: 'ChiNhanh',
        chiNhanh: { id: 'branch-1', ten: 'Phòng khám Quận 1' },
      }),
    );
    renderApp(PAGE_PATH);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không đủ quyền truy cập',
    );
    expect(
      screen.queryByRole('heading', { name: 'Cài đặt hệ thống', level: 1 }),
    ).toBeNull();
    expect(screen.queryByLabelText(/Thời hạn giữ chỗ/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Cài đặt hệ thống' })).toBeNull();
    expect(screen.queryByText('Cài đặt hệ thống')).toBeNull();
    expect(configCalls()).toHaveLength(0);
  });
});

describe('CHF5-52 vai trò khác Quản trị viên không vào được', () => {
  it.each(['LeTan', 'BacSi', 'BenhNhan'] as const)(
    'CHF5-52 %s mở /admin/cai-dat-he-thong: trang 404, không có màn cài đặt, không gọi API cấu hình',
    async (vaiTro) => {
      await startAs(vaiTro);
      renderApp(PAGE_PATH);

      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Cài đặt hệ thống' }),
      ).toBeNull();
      await waitFor(() => expect(configCalls()).toHaveLength(0));
    },
  );
});

describe('CHF5-53 lớp thứ ba: máy chủ vẫn từ chối', () => {
  it('CHF5-53 GET trả 403 dù giao diện cho vào: câu "Bạn không có quyền…", không nút Thử lại, không biểu mẫu', async () => {
    await startAs('QuanTriVien');
    api.failNext('/admin/me', () => response({ phamVi: 'ToanHeThong' }));
    api.failNext(CONFIG_URL, () => apiError(403, 'KHONG_DU_QUYEN'));
    renderApp(PAGE_PATH);

    const alert = await screen.findByText(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(alert).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.queryByLabelText(/Thời hạn giữ chỗ/)).toBeNull();
  });
});
