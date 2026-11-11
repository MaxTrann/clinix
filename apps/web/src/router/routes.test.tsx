import { cleanup, render, screen } from '@testing-library/react';
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
    expect(
      screen.getByRole('heading', {
        name: 'Đặt lịch khám đúng bác sĩ, đúng giờ',
      }),
    ).toBeInTheDocument();
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

// booking F3 `[ĐỤNG router]`. Mã ca BWZ-07 là [đề xuất] (PLAN booking mục 7.27). Chi tiết từng bước ở features/booking/wizard.
describe('routes — Bước 4–6 của luồng đặt lịch', () => {
  afterEach(() => {
    resetAuthForTest();
    vi.unstubAllGlobals();
  });

  it('BWZ-07 chưa đăng nhập ⇒ /dang-nhap kèm from; vai khác Bệnh nhân ⇒ 404 trong khung công khai; Bệnh nhân vào được', async () => {
    stubPublicApi();
    const paths = [
      '/dat-lich/thong-tin?khungGioId=5',
      '/dat-lich/xac-nhan?khungGioId=5',
      '/dat-lich/thanh-toan/CP1',
      '/dat-lich/hoan-tat/CP1',
    ];

    for (const path of paths) {
      setAuthState({ status: 'unauthenticated' });
      const router = renderAt(path, createAppRoutes());
      await screen.findByRole('heading', { name: 'Đăng nhập' });
      expect(router.state.location.pathname).toBe('/dang-nhap');
      expect(router.state.location.state).toEqual({ from: path });
      cleanup();
    }

    for (const vaiTro of ['LeTan', 'BacSi', 'QuanTriVien'] as const) {
      for (const path of paths) {
        setAuthState({
          status: 'authenticated',
          user: { vaiTro, hoTen: 'Người mẫu', daXacMinhEmail: true },
        });
        renderAt(path, createAppRoutes());
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' });
        expect(screen.queryByTestId(/booking-step-\d-body/)).toBeNull();
        cleanup();
      }
    }

    setAuthState({
      status: 'authenticated',
      user: { vaiTro: 'BenhNhan', hoTen: 'Người mẫu', daXacMinhEmail: true },
    });
    renderAt('/dat-lich/thanh-toan/CP1', createAppRoutes());
    expect(
      await screen.findByTestId('booking-step-5-body'),
    ).toBeInTheDocument();
    cleanup();
    renderAt('/dat-lich/hoan-tat/CP1', createAppRoutes());
    expect(
      await screen.findByTestId('booking-step-6-body'),
    ).toBeInTheDocument();
    cleanup();
    renderAt('/dat-lich/thong-tin', createAppRoutes());
    expect(
      await screen.findByText('Liên kết chọn khung giờ không hợp lệ.'),
    ).toBeInTheDocument();
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
