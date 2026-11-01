import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AdminMeProvider } from './admin-me-context';
import { AdminScopeGuard } from './admin-scope-guard';
import { createAppRoutes } from '../../router/routes';
import { apiError, createFakeAuthApi } from '../../test/fake-auth-api';
import { resetAuthForTest, restoreSession } from '../auth/auth-session';
import { setAuthState } from '../auth/auth-store';
import type { AdminMe } from './admin-me';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderAdmin(path = '/admin') {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

let api: ReturnType<typeof createFakeAuthApi>;

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi({
    vaiTro: 'QuanTriVien',
    hoTen: 'Trung VQ',
    daXacMinhEmail: true,
  });
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Admin F1 shell', () => {
  async function signIn() {
    api.startSession();
    await restoreSession();
  }

  it('AF1-01 hiển thị shell và nhãn Toàn hệ thống, không dựng dashboard mẫu', async () => {
    await signIn();
    api.failNext('/admin/me', () => response({ phamVi: 'ToanHeThong' }));

    renderAdmin();

    expect(await screen.findByText('Trung VQ')).toBeInTheDocument();
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Khu vực Admin' })).toBeInTheDocument();
    expect(screen.queryByText(/lịch hẹn hôm nay|doanh thu|tổng bệnh nhân/i)).toBeNull();
  });

  it('AF1-02 lấy nhãn chi nhánh từ GET /admin/me', async () => {
    await signIn();
    api.failNext('/admin/me', () =>
      response({
        phamVi: 'ChiNhanh',
        chiNhanh: { id: 'branch-1', ten: 'Phòng khám Quận 1' },
      }),
    );

    renderAdmin('/admin?chiNhanhId=forged');

    expect(
      await screen.findByText('Quản trị viên · Phòng khám Quận 1'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/forged/)).toBeNull();
  });

  it('AF1-03 loading che shell; 403 hiện trang Không đủ quyền', async () => {
    await signIn();
    let finishRequest!: (value: Response) => void;
    api.failNext(
      '/admin/me',
      () => new Promise<Response>((resolve) => (finishRequest = resolve)),
    );
    renderAdmin();

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải phạm vi');
    expect(screen.queryByRole('navigation', { name: 'Điều hướng Admin' })).toBeNull();

    finishRequest(apiError(403, 'KHONG_DU_QUYEN'));
    expect(
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).toBeInTheDocument();
  });

  it('AF1-03 lỗi tạm thời dùng ErrorState và thử lại GET /admin/me', async () => {
    await signIn();
    api.failNext('/admin/me', () => Promise.reject(new Error('network')));
    api.failNext('/admin/me', () => response({ phamVi: 'ToanHeThong' }));
    renderAdmin();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByRole('navigation', { name: 'Điều hướng Admin' })).toBeInTheDocument();
  });

  it('AF1-05 giữ auth gate và placeholder của vai trò khác', async () => {
    setAuthState({
      status: 'authenticated',
      user: {
        vaiTro: 'BenhNhan',
        hoTen: 'Bệnh nhân mẫu',
        daXacMinhEmail: true,
      },
    });

    renderAdmin();

    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng Admin' })).toBeNull();
  });

  it('AF1-05 khách mở /admin được chuyển về đăng nhập', async () => {
    setAuthState({ status: 'unauthenticated' });
    const router = renderAdmin();

    expect(
      await screen.findByRole('heading', { name: 'Đăng nhập' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dang-nhap');
  });

  it('AF1-06 menu F2–F9 hiện nhưng không bấm được hoặc có badge giả', async () => {
    await signIn();
    api.failNext('/admin/me', () => response({ phamVi: 'ToanHeThong' }));
    renderAdmin();

    const navigation = await screen.findByRole('navigation', {
      name: 'Điều hướng Admin',
    });
    expect(
      screen.getByRole('link', { name: 'Tổng quan' }),
    ).toHaveAttribute('href', '/admin');
    expect(
      screen.getByRole('button', { name: 'Chuyên khoa' }),
    ).toBeDisabled();
    const disabledItems = navigation.querySelectorAll('button');
    expect(disabledItems.length).toBeGreaterThan(0);
    expect([...disabledItems].every((item) => item.disabled)).toBe(true);
    expect(navigation.querySelector('[data-badge]')).toBeNull();
  });
});

function GuardHarness({
  adminMe,
  policy,
}: {
  adminMe: AdminMe;
  policy: 'Any' | 'ToanHeThong';
}) {
  return (
    <AdminMeProvider value={adminMe}>
      <AdminScopeGuard policy={policy} />
    </AdminMeProvider>
  );
}

describe('AdminScopeGuard', () => {
  function renderGuard(adminMe: AdminMe, policy: 'Any' | 'ToanHeThong') {
    const router = createMemoryRouter(
      [
        {
          path: '/admin/secret',
          element: <GuardHarness adminMe={adminMe} policy={policy} />,
          children: [{ index: true, element: <p>Nội dung hạn chế</p> }],
        },
      ],
      { initialEntries: ['/admin/secret'] },
    );
    render(<RouterProvider router={router} />);
  }

  it('AF1-04 từ chối route Toàn hệ thống với scope Chi nhánh', () => {
    renderGuard(
      { phamVi: 'ChiNhanh', chiNhanh: { id: 'branch-1', ten: 'Quận 1' } },
      'ToanHeThong',
    );
    expect(
      screen.getByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nội dung hạn chế')).toBeNull();
  });

  it('AF1-04 cho phép route Toàn hệ thống với scope Toàn hệ thống', () => {
    renderGuard({ phamVi: 'ToanHeThong' }, 'ToanHeThong');
    expect(screen.getByText('Nội dung hạn chế')).toBeInTheDocument();
  });
});
