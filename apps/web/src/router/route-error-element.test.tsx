import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Link, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ROLE_HOME_PATHS } from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import { ERROR_VARIANTS } from '../shared/ui/error-variant';
import { RouteErrorElement } from './route-error-element';
import { createRoleRoutes } from './role-routes';
import { createAppRoutes } from './routes';

// DUX4-40 đến 45 (doctor UX4, G18, T9): màn 500 gắn làm `errorElement` của route gốc và của route Admin, MỘT thành phần cho cả hai.
// Ca gốc qua `createAppRoutes` (WS-53) nằm ở routes.test.tsx; PL-06, PL-13, WK-07 (ba khung giữ dạng gọn) và AF1-03 chạy lại ở file của chúng (DUX4-46).

function renderRoutes(path: string, routes: RouteObject[]) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

function silenceRouterLogs() {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

function Broken(): never {
  throw new Error('chi tiết nội bộ SELECT * FROM tai_khoan');
}

afterEach(() => {
  vi.restoreAllMocks();
  resetAuthForTest();
});

describe('RouteErrorElement', () => {
  it('DUX4-40 route con ném lỗi: hiện màn 500 (tiêu đề, role=alert, focus vào tiêu đề), không lộ chi tiết', () => {
    silenceRouterLogs();
    renderRoutes('/hong', [
      {
        errorElement: <RouteErrorElement />,
        children: [{ path: '/hong', element: <Broken /> }],
      },
    ]);

    const title = screen.getByRole('heading', {
      level: 1,
      name: ERROR_VARIANTS.system.title,
    });
    expect(title).toHaveFocus();
    expect(screen.getByRole('alert')).toContainElement(title);
    expect(document.body).not.toHaveTextContent('chi tiết nội bộ');
    expect(document.body).not.toHaveTextContent('tai_khoan');
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('DUX4-41 route Admin ném lỗi: cùng màn 500, không còn tiêu đề "Không thể tải trang quản trị"', () => {
    silenceRouterLogs();
    setAuthState({
      status: 'authenticated',
      user: { vaiTro: 'QuanTriVien', hoTen: 'Người mẫu', daXacMinhEmail: true },
    });
    const adminGate = createRoleRoutes().find(
      (route) => route.children?.[0].path === ROLE_HOME_PATHS.QuanTriVien,
    );
    const adminRoute = adminGate?.children?.[0];
    expect(adminGate).toBeDefined();
    expect(adminRoute).toBeDefined();
    if (!adminGate || !adminRoute) return;

    // Giữ nguyên `errorElement` THẬT của route Admin; chỉ thay phần tử bằng trang hỏng để khỏi gọi /admin/me
    renderRoutes(ROLE_HOME_PATHS.QuanTriVien, [
      {
        element: adminGate.element,
        children: [
          {
            path: adminRoute.path,
            errorElement: adminRoute.errorElement,
            element: <Broken />,
          },
        ],
      },
    ]);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: ERROR_VARIANTS.system.title,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Không thể tải trang quản trị')).toBeNull();
    expect(document.body).not.toHaveTextContent('chi tiết nội bộ');
  });

  it('DUX4-42 gốc và Admin cùng gắn RouteErrorElement; hai thành phần cũ không còn (file và import)', () => {
    const [root] = createAppRoutes();
    const adminRoute = createRoleRoutes().find(
      (route) => route.children?.[0].path === ROLE_HOME_PATHS.QuanTriVien,
    )?.children?.[0];

    expect(root.errorElement).toBeDefined();
    expect((root.errorElement as { type: unknown }).type).toBe(
      RouteErrorElement,
    );
    expect(
      (adminRoute?.errorElement as { type: unknown } | undefined)?.type,
    ).toBe(RouteErrorElement);
    // Chỉ lấy khoá của glob (không nạp file), như `css-source.ts`: không cần `node:fs` ngoài khai báo kiểu sẵn có
    const sources = Object.keys(import.meta.glob('/src/**/*.tsx'));
    expect(sources).toContain('/src/router/route-error-element.tsx');
    expect(sources).not.toContain('/src/pages/route-error-page.tsx');
    expect(sources).not.toContain(
      '/src/features/admin/admin-error-boundary.tsx',
    );
  });

  it('DUX4-43 route `lazy` nạp chunk hỏng: hiện màn 500, không lộ đường dẫn chunk hay thông điệp', async () => {
    silenceRouterLogs();
    renderRoutes('/trang-lazy', [
      {
        errorElement: <RouteErrorElement />,
        children: [
          {
            path: '/trang-lazy',
            lazy: () =>
              Promise.reject(
                new TypeError(
                  'Failed to fetch dynamically imported module: https://clinix.example/assets/x-9f3a.js',
                ),
              ),
          },
        ],
      },
    ]);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: ERROR_VARIANTS.system.title,
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Failed to fetch');
    expect(document.body).not.toHaveTextContent('x-9f3a');
  });

  it('DUX4-44 "Thử lại" tải lại trang đúng một lần', () => {
    silenceRouterLogs();
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload,
    } as Location);
    renderRoutes('/hong', [
      {
        errorElement: <RouteErrorElement />,
        children: [{ path: '/hong', element: <Broken /> }],
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('DUX4-45 "Về trang chủ" đưa tới "/" và hiện trang chủ, kể cả khi chính "/" vừa lỗi', () => {
    silenceRouterLogs();
    let broken = true;
    function Home() {
      if (broken) throw new Error('lỗi tạm');
      return (
        <>
          <p>Trang chủ thử</p>
          <Link to="/hong">sang trang hỏng</Link>
        </>
      );
    }
    const router = renderRoutes('/', [
      {
        errorElement: <RouteErrorElement />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/hong', element: <Broken /> },
        ],
      },
    ]);
    expect(
      screen.getByRole('heading', { name: ERROR_VARIANTS.system.title }),
    ).toBeInTheDocument();

    broken = false;
    fireEvent.click(screen.getByRole('link', { name: 'Về trang chủ' }));

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByText('Trang chủ thử')).toBeInTheDocument();
  });
});
