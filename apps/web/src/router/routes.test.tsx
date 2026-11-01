import { render, screen } from '@testing-library/react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
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

describe('routes', () => {
  it('WS-50 / hiện trang chủ CLINIX', () => {
    renderAt('/', createAppRoutes());
    expect(screen.getByRole('heading', { name: 'CLINIX' })).toBeInTheDocument();
  });

  it('WS-51 đường lạ hiện trang 404', () => {
    renderAt('/duong-bat-ky', createAppRoutes());
    expect(
      screen.getByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
  });

  it('WS-52 createAppRoutes mặc định KHOÁ: không render con protected', () => {
    renderAt('/bi-mat', createAppRoutes([SECRET_ROUTE]));
    expect(screen.queryByText('Nội dung bí mật')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
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
