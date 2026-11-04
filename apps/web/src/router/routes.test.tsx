import { render, screen } from '@testing-library/react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import { AccessGate, type AccessDecision } from './access-gate';
import { createAppRoutes } from './routes';

// Task P6. Mã ca WS-nn là [đề xuất] (issue #18 không có test case riêng).
function renderAt(path: string, routes: RouteObject[]) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

const SECRET_ROUTE = { path: '/bi-mat', element: <p>Nội dung bí mật</p> };

function gatedRoutes(decision: AccessDecision): RouteObject[] {
  return [
    {
      element: <AccessGate decision={decision} denied={<p>Bị chặn</p>} />,
      children: [SECRET_ROUTE],
    },
  ];
}

// Khung công khai (search F1) gọi /public/clinic-info khi gắn: giả API lỗi để test không đi ra mạng thật (chân trang chịu được lỗi, KC-05)
function stubPublicApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))),
  );
}

describe('routes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('LP-60 (F3) mở thẳng route lazy: hiện loading, không màn trắng, không cảnh báo HydrateFallback', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setAuthState({ status: 'unauthenticated' });
    renderAt('/dang-nhap', createAppRoutes());

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(screen.queryByRole('status')).toBeNull();
    expect(warn).not.toHaveBeenCalled();

    resetAuthForTest();
    warn.mockRestore();
  });

  it('WS-50 / hiện trang chủ CLINIX', () => {
    stubPublicApi();
    renderAt('/', createAppRoutes());
    expect(screen.getByRole('heading', { name: 'CLINIX' })).toBeInTheDocument();
  });

  it('WS-51 đường lạ hiện trang 404', () => {
    stubPublicApi();
    renderAt('/duong-bat-ky', createAppRoutes());
    expect(
      screen.getByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
  });

  // Đổi ở F1 (quyết định 12): cổng giờ đọc store nên chưa rõ phiên thì loading, chưa đăng nhập thì về /dang-nhap (AU-67), không còn 404.
  it('WS-52 createAppRoutes mặc định KHOÁ: không render con protected', () => {
    renderAt('/bi-mat', createAppRoutes([SECRET_ROUTE]));
    expect(screen.queryByText('Nội dung bí mật')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('WS-53 lỗi khi render hiện trang lỗi chung, không lộ chi tiết kỹ thuật', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    function Broken(): never {
      throw new Error('chi tiết nội bộ');
    }
    const [root] = createAppRoutes();
    renderAt('/hong', [
      {
        element: root.element,
        errorElement: root.errorElement,
        children: [{ path: '/hong', element: <Broken /> }],
      },
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent('Đã có lỗi xảy ra');
    expect(screen.queryByText(/chi tiết nội bộ/)).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('AccessGate', () => {
  it('WS-54 allowed thì render con', () => {
    renderAt('/bi-mat', gatedRoutes('allowed'));
    expect(screen.getByText('Nội dung bí mật')).toBeInTheDocument();
  });

  it('WS-55 denied thì chỉ hiện nội dung denied', () => {
    renderAt('/bi-mat', gatedRoutes('denied'));
    expect(screen.getByText('Bị chặn')).toBeInTheDocument();
    expect(screen.queryByText('Nội dung bí mật')).not.toBeInTheDocument();
  });

  it('WS-56 checking thì hiện loading, không lộ con', () => {
    renderAt('/bi-mat', gatedRoutes('checking'));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Nội dung bí mật')).not.toBeInTheDocument();
    expect(screen.queryByText('Bị chặn')).not.toBeInTheDocument();
  });
});
