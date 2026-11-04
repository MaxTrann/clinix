import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import {
  ROLE_HOME_PATHS,
  ROLE_LABELS,
  type AuthUser,
  type VaiTro,
} from '../features/auth';
import {
  resetAuthForTest,
  restoreSession,
} from '../features/auth/auth-session';
import { getAuthState, setAuthState } from '../features/auth/auth-store';
import { PATIENT_PATHS } from '../features/patient';
import { apiError, createFakeAuthApi } from '../test/fake-auth-api';
import { createAppRoutes } from './routes';

// patient F1 (TRACKING F1-H): khung Bệnh nhân ghép vào router thật. Mã ca PL-nn là [đề xuất]; mỗi ca ghi mã KG của PLAN mục 7.5.
const PATIENT_MENU = [
  'Tổng quan',
  'Lịch hẹn của tôi',
  'Hồ sơ khám bệnh',
  'Ví của tôi',
  'Danh sách chờ',
  'Tin nhắn',
  'Thông báo',
  'Hồ sơ người khám',
];

let api: ReturnType<typeof createFakeAuthApi>;

function signedInAs(vaiTro: VaiTro) {
  const user: AuthUser = {
    vaiTro,
    hoTen: `Họ tên ${vaiTro}`,
    daXacMinhEmail: true,
  };
  setAuthState({ status: 'authenticated', user });
}

function renderAt(path: string, routes: RouteObject[] = createAppRoutes()) {
  const router = createMemoryRouter(routes, {
    initialEntries: ['/', path],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

const shell = () =>
  screen.findByRole('complementary', { name: 'Điều hướng Bệnh nhân' });
const logoutButtons = () =>
  screen.getAllByRole('button', { name: 'Đăng xuất' });

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('khung Bệnh nhân', () => {
  it('PL-01 KG-01 Q21e BN vào /benh-nhan: chuyển tới Hồ sơ người khám bằng replace, menu đúng thứ tự Figma, họ tên + "Bệnh nhân"', async () => {
    signedInAs('BenhNhan');
    const router = renderAt(ROLE_HOME_PATHS.BenhNhan);

    expect(
      await screen.findByRole('heading', { name: 'Hồ sơ người khám' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATIENT_PATHS.profile);
    expect(router.state.historyAction).toBe('REPLACE');

    const aside = await shell();
    expect(within(aside).getByText('Họ tên BenhNhan')).toBeInTheDocument();
    expect(within(aside).getByText(ROLE_LABELS.BenhNhan)).toBeInTheDocument();
    const menu = within(aside).getByRole('navigation', { name: 'Menu chính' });
    const labels = within(menu)
      .getAllByRole('listitem')
      .map((item) => item.textContent?.replace(' (chưa được triển khai)', ''));
    expect(labels).toEqual(PATIENT_MENU);
    expect(
      within(menu).getByRole('link', { name: 'Hồ sơ người khám' }),
    ).toHaveAttribute('aria-current', 'page');
    // `to` của mục trong role-nav.ts phải trỏ đúng trang, không phải gốc khung (vẫn sáng ở trang con nếu trỏ gốc)
    expect(
      within(menu).getByRole('link', { name: 'Hồ sơ người khám' }),
    ).toHaveAttribute('href', PATIENT_PATHS.profile);
    // Chỉ "Hồ sơ người khám" có trang ở F1; bảy mục còn lại vô hiệu (KG-04)
    expect(within(menu).getAllByRole('link')).toHaveLength(1);
    for (const button of within(menu).getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    expect(
      within(aside).getByRole('link', { name: 'Về trang chủ' }),
    ).toHaveAttribute('href', '/');
    expect(logoutButtons()).toHaveLength(2);

    // replace: Back về trang trước (`/`), không quay lại /benh-nhan để bị chuyển tiếp lần nữa
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/');
  });

  it('PL-01b KG-01 mở thẳng /benh-nhan/ho-so-nguoi-kham không bị chuyển hướng', async () => {
    signedInAs('BenhNhan');
    const router = renderAt(PATIENT_PATHS.profile);
    await screen.findByRole('heading', { name: 'Hồ sơ người khám' });
    expect(router.state.historyAction).toBe('POP');
    expect(screen.getByText('Chưa được triển khai.')).toBeInTheDocument();
  });

  it.each([
    ['BenhNhan', ROLE_HOME_PATHS.LeTan],
    ['BenhNhan', ROLE_HOME_PATHS.QuanTriVien],
    ['BenhNhan', ROLE_HOME_PATHS.BacSi],
    ['LeTan', ROLE_HOME_PATHS.BenhNhan],
    ['LeTan', PATIENT_PATHS.profile],
    ['BacSi', ROLE_HOME_PATHS.BenhNhan],
    ['QuanTriVien', PATIENT_PATHS.profile],
  ] as const)(
    'PL-02 KG-03 %s mở %s: 404, không thấy khung Bệnh nhân',
    async (vaiTro, path) => {
      signedInAs(vaiTro);
      const router = renderAt(path);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(path);
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Bệnh nhân' }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    },
  );

  it('PL-02b KG-03 khách mở /benh-nhan/ho-so-nguoi-kham: về /dang-nhap bằng replace, không lộ khung', async () => {
    setAuthState({ status: 'unauthenticated' });
    const router = renderAt(PATIENT_PATHS.profile);
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(
      screen.queryByRole('complementary', { name: 'Điều hướng Bệnh nhân' }),
    ).toBeNull();
  });

  it('PL-02c KG-03 đang kiểm phiên: loading, không lộ khung, không chuyển hướng', () => {
    const router = renderAt(ROLE_HOME_PATHS.BenhNhan);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(router.state.location.pathname).toBe(ROLE_HOME_PATHS.BenhNhan);
  });

  it('PL-03 KG-05 G5 bấm Đăng xuất ở thanh bên rồi thanh trên: một request, không hộp xác nhận, về /dang-nhap', async () => {
    api.startSession();
    await restoreSession();
    expect(getAuthState().user?.vaiTro).toBe('BenhNhan');
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    const release = api.hold('/auth/logout');
    const router = renderAt(PATIENT_PATHS.profile);
    await shell();

    const [sidebar, topbar] = logoutButtons();
    fireEvent.click(sidebar);
    // Một hook cho cả hai nút: nút thanh trên cũng khoá ngay
    expect(topbar).toBeDisabled();
    expect(sidebar).toBeDisabled();
    fireEvent.click(topbar);
    await vi.waitFor(() => expect(api.logoutCalls).toBe(1));
    await act(async () => {
      release(204, null);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(api.logoutCalls).toBe(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(getAuthState().status).toBe('unauthenticated');
  });

  it('PL-04 KG-05 /auth/logout 500: câu lỗi + "Thử lại", vẫn ở khung; Thử lại gửi request thứ hai và về đăng nhập', async () => {
    api.startSession();
    await restoreSession();
    expect(getAuthState().user?.vaiTro).toBe('BenhNhan');
    api.failNext('/auth/logout', () => apiError(500, 'LOI_HE_THONG'));
    const router = renderAt(PATIENT_PATHS.profile);
    await shell();

    fireEvent.click(logoutButtons()[1]);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không đăng xuất được, vui lòng thử lại');
    expect(router.state.location.pathname).toBe(PATIENT_PATHS.profile);
    for (const button of logoutButtons()) expect(button).toBeEnabled();

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(api.logoutCalls).toBe(2);
  });

  it('PL-05 KG-07 BacSi, LeTan vẫn là trang giữ chỗ; QuanTriVien vẫn là khung Admin', async () => {
    signedInAs('BacSi');
    renderAt(ROLE_HOME_PATHS.BacSi);
    expect(screen.getByRole('heading', { name: 'Bác sĩ' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Đăng xuất' })).toHaveLength(
      1,
    );
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('PL-05b KG-07 LeTan vẫn là trang giữ chỗ', () => {
    signedInAs('LeTan');
    renderAt(ROLE_HOME_PATHS.LeTan);
    expect(screen.getByRole('heading', { name: 'Lễ tân' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('PL-05c KG-07 QuanTriVien vẫn vào khung Admin', async () => {
    signedInAs('QuanTriVien');
    api.failNext(
      '/admin/me',
      () =>
        new Response(JSON.stringify({ phamVi: 'ToanHeThong' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    renderAt(ROLE_HOME_PATHS.QuanTriVien);
    expect(
      await screen.findByRole('complementary', { name: 'Điều hướng Admin' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Điều hướng Bệnh nhân' }),
    ).toBeNull();
  });

  it('PL-06 F1-F trang con ném lỗi: khung và nút Đăng xuất còn, lỗi hiện câu chung, không lộ chi tiết', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    signedInAs('BenhNhan');
    function Broken(): never {
      throw new Error('chi tiết nội bộ');
    }
    const routes = createAppRoutes();
    // Gắn thêm một trang con hỏng vào đúng chỗ module khác sẽ cắm trang (mảng con của route bọc lỗi)
    const patientRoute = routes[0].children
      ?.flatMap((route) => route.children ?? [])
      .find((route) => route.path === ROLE_HOME_PATHS.BenhNhan);
    const pages = patientRoute?.children?.[0].children;
    pages?.push({ path: 'hong', element: <Broken /> });
    // Mảng route là hằng của module: gỡ trang hỏng khi xong để không ảnh hưởng ca khác
    onTestFinished(() => void pages?.pop());
    renderAt(`${ROLE_HOME_PATHS.BenhNhan}/hong`, routes);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra');
    expect(screen.queryByText(/chi tiết nội bộ/)).toBeNull();
    const aside = await shell();
    expect(screen.getByRole('main')).toContainElement(alert);
    expect(aside).not.toContainElement(alert);
    expect(logoutButtons()).toHaveLength(2);
  });

  it('PL-07 đường lạ trong khu Bệnh nhân: trang 404 của gốc', async () => {
    signedInAs('BenhNhan');
    renderAt(`${ROLE_HOME_PATHS.BenhNhan}/duong-la`);
    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
  });
});
