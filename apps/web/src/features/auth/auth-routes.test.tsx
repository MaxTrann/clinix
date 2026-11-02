import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../router/routes';
import { apiError, createFakeAuthApi } from '../../test/fake-auth-api';
import { resetAuthForTest, restoreSession } from './auth-session';
import { getAuthState, setAuthState, type AuthUser } from './auth-store';
import { ROLE_HOME_PATHS, ROLE_LABELS, type VaiTro } from './roles';

// Task F1. Mã ca AU-nn là [đề xuất]; ca nào phủ test case của PLAN thì ghi kèm mã đó.
const ROLES = Object.keys(ROLE_HOME_PATHS) as VaiTro[];
const PLACEHOLDER_ROLES = ROLES.filter((role) => role !== 'QuanTriVien');

function userOf(vaiTro: VaiTro): AuthUser {
  return { vaiTro, hoTen: `Họ tên ${vaiTro}`, daXacMinhEmail: true };
}

function signedInAs(vaiTro: VaiTro) {
  setAuthState({ status: 'authenticated', user: userOf(vaiTro) });
}

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

let api: ReturnType<typeof createFakeAuthApi>;

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi();
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('đường dẫn theo mã Figma Make', () => {
  it('AU-60 bảng đường dẫn đúng quyết định của nhóm', () => {
    expect(ROLE_HOME_PATHS).toEqual({
      BenhNhan: '/benh-nhan',
      BacSi: '/bac-si-portal',
      LeTan: '/le-tan',
      QuanTriVien: '/admin',
    });
  });
});

describe('trang giữ chỗ và cổng vai trò', () => {
  it.each(PLACEHOLDER_ROLES)(
    'AU-61 (DN-03) %s vào đúng trang giữ chỗ',
    (vaiTro) => {
    signedInAs(vaiTro);
    renderAt(ROLE_HOME_PATHS[vaiTro]);
    expect(
      screen.getByRole('heading', { name: ROLE_LABELS[vaiTro] }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Họ tên ${vaiTro}`)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Đăng xuất' }),
    ).toBeInTheDocument();
    },
  );

  it.each(
    ROLES.flatMap((a) => ROLES.filter((b) => a !== b).map((b) => [a, b])),
  )(
    'AU-62 %s vào trang của %s thấy 404, không lộ nội dung',
    (vaiTro, other) => {
      signedInAs(vaiTro as VaiTro);
      renderAt(ROLE_HOME_PATHS[other as VaiTro]);
      expect(
        screen.getByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
      expect(
        screen.queryByRole('heading', { name: ROLE_LABELS[other as VaiTro] }),
      ).toBeNull();
    },
  );

  it('AU-63 checking: hiện loading, không lộ con, không nháy trang đăng nhập', () => {
    const router = renderAt('/benh-nhan');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    expect(router.state.location.pathname).toBe('/benh-nhan');
  });

  it('AU-64 chưa đăng nhập: chuyển tới /dang-nhap bằng replace', async () => {
    setAuthState({ status: 'unauthenticated' });
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: ['/', '/benh-nhan'],
      initialIndex: 1,
    });
    render(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
  });

  it('AU-65 trạng thái lỗi: có Thử lại, không chuyển về đăng nhập', async () => {
    setAuthState({ status: 'error', canRetry: true });
    api.startSession();
    const router = renderAt('/benh-nhan');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/benh-nhan');

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('heading', { name: 'Bệnh nhân' });
    expect(api.refreshCalls).toBe(1);
  });

  it('AU-66 lỗi cấu hình Origin: không có nút Thử lại', () => {
    setAuthState({ status: 'error', canRetry: false });
    renderAt('/benh-nhan');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('AU-67 route protected của createAppRoutes cần đăng nhập', async () => {
    setAuthState({ status: 'unauthenticated' });
    const router = createMemoryRouter(
      createAppRoutes([{ path: '/bi-mat', element: <p>Nội dung bí mật</p> }]),
      { initialEntries: ['/bi-mat'] },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(screen.queryByText('Nội dung bí mật')).toBeNull();
  });

  it('AU-68 route protected hiện khi đã đăng nhập, mọi vai trò', () => {
    signedInAs('LeTan');
    const router = createMemoryRouter(
      createAppRoutes([{ path: '/bi-mat', element: <p>Nội dung bí mật</p> }]),
      { initialEntries: ['/bi-mat'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Nội dung bí mật')).toBeInTheDocument();
  });

  it('AU-69 (DX-09) phiên hết giữa chừng: rời trang giữ chỗ về đăng nhập, có thông báo', async () => {
    signedInAs('BenhNhan');
    const router = renderAt('/benh-nhan');
    setAuthState({ status: 'unauthenticated', user: null, sessionEnded: true });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Phiên đăng nhập đã kết thúc',
    );
  });
});

describe('đăng xuất trên trang giữ chỗ', () => {
  async function signInThroughApi() {
    await restoreSession();
    signedInAs('BenhNhan');
  }

  it('AU-70 (DX-08) 204: về đăng nhập bằng replace, Back không hiện trang cần đăng nhập', async () => {
    await signInThroughApi();
    const confirmSpy = vi.fn();
    vi.stubGlobal('confirm', confirmSpy);
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: ['/', '/benh-nhan'],
      initialIndex: 1,
    });
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(confirmSpy).not.toHaveBeenCalled();
    await router.navigate('/benh-nhan');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
  });

  it('AU-71 lỗi: giữ trang, báo câu đã chốt, Thử lại gửi lại', async () => {
    await signInThroughApi();
    api.failNext('/auth/logout', () => apiError(500, 'LOI_HE_THONG'));
    const router = renderAt('/benh-nhan');

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không đăng xuất được, vui lòng thử lại',
    );
    expect(router.state.location.pathname).toBe('/benh-nhan');

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(api.logoutCalls).toBe(2);
  });
});

describe('trang công khai', () => {
  it('AU-72 đã đăng nhập: / không chuyển hướng, có liên kết về trang của vai trò', () => {
    signedInAs('BacSi');
    const router = renderAt('/');
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: 'CLINIX' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Về trang của bạn' }),
    ).toHaveAttribute('href', '/bac-si-portal');
  });

  it.each(['checking', 'unauthenticated', 'error'] as const)(
    'AU-73 %s: / là trang công khai, không có liên kết',
    (status) => {
      setAuthState({ status });
      renderAt('/');
      expect(
        screen.getByRole('heading', { name: 'CLINIX' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('link')).toBeNull();
    },
  );

  it('AU-74 /dang-nhap khi đã đăng nhập chuyển về trang vai trò bằng replace', async () => {
    signedInAs('LeTan');
    const router = renderAt('/dang-nhap');
    await waitFor(() => expect(router.state.location.pathname).toBe('/le-tan'));
    expect(router.state.historyAction).toBe('REPLACE');
  });

  // AU-75, AU-76 đổi có duyệt ở F3 (D5): route đăng nhập là `lazy` nên phải chờ trang tải xong
  it('AU-75 /dang-nhap khi checking hiện loading', async () => {
    renderAt('/dang-nhap');
    expect(await screen.findByRole('status')).toHaveTextContent('Đang tải');
  });

  it('AU-76 /dang-nhap không có cờ thì không có thông báo phiên', async () => {
    setAuthState({ status: 'unauthenticated' });
    renderAt('/dang-nhap');
    expect(
      await screen.findByRole('heading', { name: 'Đăng nhập' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('AU-77 StrictMode không làm mới hai lần', async () => {
    api.startSession();
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: ['/benh-nhan'],
    });
    void restoreSession();
    render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
    await screen.findByRole('heading', { name: 'Bệnh nhân' });
    expect(api.refreshCalls).toBe(1);
    expect(getAuthState().status).toBe('authenticated');
  });

  it('AU-78 một vai trò không thấy nhãn vai trò khác trên trang mình', () => {
    signedInAs('BacSi');
    renderAt('/bac-si-portal');
    for (const role of ROLES.filter((r) => r !== 'BacSi')) {
      expect(screen.queryByText(ROLE_LABELS[role])).toBeNull();
    }
  });
});
