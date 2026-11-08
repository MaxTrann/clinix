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
import { PATIENT_PATHS, RECEPTION_PATHS } from '../features/patient';
import { createFakeProfileApi } from '../features/patient/testing/fake-profile-api';
import { apiError, createFakeAuthApi } from '../test/fake-auth-api';
import { fakeMatchMedia } from '../test/fake-match-media';
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
  // Đổi có duyệt ở patient F3: trang Hồ sơ người khám thật gọi GET /api/profile (fake auth trả { ok: true } hoặc 401 cho đường dẫn này), nên ca PL-01, PL-01b, PL-04, PL-16, PL-18 cần /profile giả.
  vi.stubGlobal('fetch', vi.fn(createFakeProfileApi(api.fetch).fetch));
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
    // Đổi có duyệt ở patient F3: trang thật hiện hồ sơ (họ tên từ GET /api/profile) và nút "Chỉnh sửa", thay cho câu "Chưa được triển khai."
    expect(
      await screen.findByRole('button', { name: 'Chỉnh sửa' }),
    ).toBeVisible();
    expect(
      screen.getByText('Nguyễn Văn A', { selector: 'dd' }),
    ).toBeInTheDocument();
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

  // Đổi có duyệt ở patient F2: tên ca bỏ "LeTan" (Lễ tân có khung ở F2, xem PL-09); thân ca, mã ca và mã KG giữ nguyên
  it('PL-05 KG-07 BacSi vẫn là trang giữ chỗ; QuanTriVien vẫn là khung Admin', async () => {
    signedInAs('BacSi');
    renderAt(ROLE_HOME_PATHS.BacSi);
    expect(screen.getByRole('heading', { name: 'Bác sĩ' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Đăng xuất' })).toHaveLength(
      1,
    );
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  // PL-05b ("LeTan vẫn là trang giữ chỗ") bỏ, đổi có duyệt ở patient F2: Lễ tân có khung thật, ca kiểm ngược lại là PL-09

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

// patient F2 (TRACKING F2-E): khung Lễ tân ghép vào router thật, dùng lại trợ giúp ở trên. Mã ca PL-nn tiếp nối F1 là [đề xuất].
const RECEPTION_MENU = [
  'Tổng quan',
  'Quản lý lịch hẹn',
  'Tra cứu bệnh nhân',
  'Lịch làm việc bác sĩ',
  'Yêu cầu đổi lịch',
  'Danh sách chờ',
  'Tin nhắn',
  'Thông báo',
  'Thông tin cá nhân',
];

const receptionShell = () =>
  screen.findByRole('complementary', { name: 'Điều hướng Lễ tân' });

describe('khung Lễ tân', () => {
  beforeEach(() => {
    // Phiên thật qua API giả cho các ca đăng xuất: tài khoản là Lễ tân
    api = createFakeAuthApi({
      vaiTro: 'LeTan',
      hoTen: 'Lễ tân mẫu',
      daXacMinhEmail: true,
    });
    vi.stubGlobal('fetch', vi.fn(api.fetch));
  });

  it('PL-09 KG-02 KG-04 KG-06 Q21e LT vào /le-tan: chuyển tới Tra cứu bệnh nhân bằng replace, 9 mục đúng thứ tự Figma, họ tên + "Lễ tân", không có "Về trang chủ"', async () => {
    signedInAs('LeTan');
    const router = renderAt(ROLE_HOME_PATHS.LeTan);

    expect(
      await screen.findByRole('heading', { name: 'Tra cứu bệnh nhân' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(RECEPTION_PATHS.lookup);
    expect(router.state.historyAction).toBe('REPLACE');

    const aside = await receptionShell();
    expect(within(aside).getByText('Họ tên LeTan')).toBeInTheDocument();
    expect(within(aside).getByText(ROLE_LABELS.LeTan)).toBeInTheDocument();
    const menu = within(aside).getByRole('navigation', { name: 'Menu chính' });
    const labels = within(menu)
      .getAllByRole('listitem')
      .map((item) => item.textContent?.replace(' (chưa được triển khai)', ''));
    expect(labels).toEqual(RECEPTION_MENU);
    const lookup = within(menu).getByRole('link', {
      name: 'Tra cứu bệnh nhân',
    });
    expect(lookup).toHaveAttribute('aria-current', 'page');
    expect(lookup).toHaveAttribute('href', RECEPTION_PATHS.lookup);
    // "Tra cứu bệnh nhân" (F2) và "Thông tin cá nhân" (F4) có trang; bảy mục còn lại vô hiệu (KG-04). Đổi có duyệt ở patient F4.
    expect(within(menu).getAllByRole('link')).toHaveLength(2);
    const profile = within(menu).getByRole('link', {
      name: 'Thông tin cá nhân',
    });
    expect(profile).toHaveAttribute('href', RECEPTION_PATHS.profile);
    expect(profile).not.toHaveAttribute('aria-current');
    const disabled = within(menu).getAllByRole('button');
    expect(disabled).toHaveLength(7);
    for (const button of disabled) expect(button).toBeDisabled();
    // Figma `483:2`: cuối thanh bên chỉ có nút Đăng xuất
    expect(screen.queryByRole('link', { name: 'Về trang chủ' })).toBeNull();
    expect(logoutButtons()).toHaveLength(2);
    // Q21b: không chuông (thanh trên chỉ có nút Đăng xuất), không số đếm nào trong khung
    expect(
      within(screen.getByRole('banner')).getAllByRole('button'),
    ).toHaveLength(1);
    expect(within(aside).queryByText(/\d/)).toBeNull();

    // replace: Back về trang trước (`/`), không quay lại /le-tan để bị chuyển tiếp lần nữa
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/');
  });

  it('PL-09b KG-02 mở thẳng /le-tan/tra-cuu-benh-nhan không bị chuyển hướng, có trang tra cứu', async () => {
    // Đường dẫn đã chốt ở Q21g; các ca khác dùng hằng nên không bắt được hằng sai (đột biến M19 của F2)
    expect(RECEPTION_PATHS.lookup).toBe('/le-tan/tra-cuu-benh-nhan');
    signedInAs('LeTan');
    const router = renderAt(RECEPTION_PATHS.lookup);
    await screen.findByRole('heading', { name: 'Tra cứu bệnh nhân' });
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.pathname).toBe(RECEPTION_PATHS.lookup);
    // Đổi có duyệt ở patient F8: trang thật hiện lời mời chọn bệnh nhân, thay cho câu "Chưa được triển khai." của trang giữ chỗ
    expect(screen.getByRole('main')).toHaveTextContent(
      'Chọn một bệnh nhân để xem hồ sơ',
    );
    expect(await receptionShell()).toBeInTheDocument();
  });

  it('PL-09c KG-06 trang con dưới "Tra cứu bệnh nhân" (chỗ của F8) vẫn làm sáng mục này: mục không đặt `end`', async () => {
    signedInAs('LeTan');
    const routes = createAppRoutes();
    // Gắn thử một trang con như F8 sẽ làm (mảng con của route bọc lỗi), gỡ khi xong
    const receptionRoute = routes[0].children
      ?.flatMap((route) => route.children ?? [])
      .find((route) => route.path === ROLE_HOME_PATHS.LeTan);
    const pages = receptionRoute?.children?.[0].children;
    pages?.push({
      path: 'tra-cuu-benh-nhan/chi-tiet',
      element: <h1>Chi tiết thử</h1>,
    });
    onTestFinished(() => void pages?.pop());
    renderAt(`${RECEPTION_PATHS.lookup}/chi-tiet`, routes);

    await screen.findByRole('heading', { name: 'Chi tiết thử' });
    const menu = within(await receptionShell()).getByRole('navigation', {
      name: 'Menu chính',
    });
    expect(
      within(menu).getByRole('link', { name: 'Tra cứu bệnh nhân' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it.each(['BenhNhan', 'BacSi', 'QuanTriVien'] as const)(
    'PL-10 KG-03 %s mở /le-tan/tra-cuu-benh-nhan: 404, không thấy khung Lễ tân',
    async (vaiTro) => {
      signedInAs(vaiTro);
      const router = renderAt(RECEPTION_PATHS.lookup);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(RECEPTION_PATHS.lookup);
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Lễ tân' }),
      ).toBeNull();
      expect(
        screen.queryByRole('heading', { name: 'Tra cứu bệnh nhân' }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    },
  );

  it('PL-10b KG-03 khách mở /le-tan/tra-cuu-benh-nhan: về /dang-nhap bằng replace, không lộ khung', async () => {
    setAuthState({ status: 'unauthenticated' });
    const router = renderAt(RECEPTION_PATHS.lookup);
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(
      screen.queryByRole('complementary', { name: 'Điều hướng Lễ tân' }),
    ).toBeNull();
  });

  it('PL-11 KG-05 G5 bấm Đăng xuất ở thanh bên rồi thanh trên: một request, không hộp xác nhận, về /dang-nhap', async () => {
    api.startSession();
    await restoreSession();
    expect(getAuthState().user?.vaiTro).toBe('LeTan');
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    const release = api.hold('/auth/logout');
    const router = renderAt(RECEPTION_PATHS.lookup);
    const aside = await receptionShell();
    expect(within(aside).getByText('Lễ tân mẫu')).toBeInTheDocument();

    const [sidebar, topbar] = logoutButtons();
    fireEvent.click(sidebar);
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

  it('PL-12 KG-05 /auth/logout 500: câu lỗi + "Thử lại", vẫn ở khung Lễ tân; Thử lại gửi request thứ hai và về đăng nhập', async () => {
    api.startSession();
    await restoreSession();
    expect(getAuthState().user?.vaiTro).toBe('LeTan');
    api.failNext('/auth/logout', () => apiError(500, 'LOI_HE_THONG'));
    const router = renderAt(RECEPTION_PATHS.lookup);
    const aside = await receptionShell();

    fireEvent.click(logoutButtons()[0]);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không đăng xuất được, vui lòng thử lại');
    expect(aside).toContainElement(alert);
    expect(router.state.location.pathname).toBe(RECEPTION_PATHS.lookup);
    for (const button of logoutButtons()) expect(button).toBeEnabled();

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(api.logoutCalls).toBe(2);
  });

  it('PL-13 F1-F trang con của khung Lễ tân ném lỗi: khung và nút Đăng xuất còn, lỗi trong vùng nội dung', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    signedInAs('LeTan');
    function Broken(): never {
      throw new Error('chi tiết nội bộ');
    }
    const routes = createAppRoutes();
    // Gắn trang hỏng vào đúng chỗ module khác sẽ cắm trang Lễ tân (mảng con của route bọc lỗi, cạnh RECEPTION_ROUTES)
    const receptionRoute = routes[0].children
      ?.flatMap((route) => route.children ?? [])
      .find((route) => route.path === ROLE_HOME_PATHS.LeTan);
    const pages = receptionRoute?.children?.[0].children;
    pages?.push({ path: 'hong', element: <Broken /> });
    onTestFinished(() => void pages?.pop());
    renderAt(`${ROLE_HOME_PATHS.LeTan}/hong`, routes);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra');
    expect(screen.queryByText(/chi tiết nội bộ/)).toBeNull();
    const aside = await receptionShell();
    expect(screen.getByRole('main')).toContainElement(alert);
    expect(aside).not.toContainElement(alert);
    expect(logoutButtons()).toHaveLength(2);
  });

  it('PL-14 đường lạ trong khu Lễ tân: trang 404 của gốc, không có khung', async () => {
    signedInAs('LeTan');
    renderAt(`${ROLE_HOME_PATHS.LeTan}/duong-la`);
    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Điều hướng Lễ tân' }),
    ).toBeNull();
  });

  it('PL-15 KG-09 thứ tự phần tử nhận focus của khung Lễ tân theo Figma; mọi nút có tên', async () => {
    signedInAs('LeTan');
    renderAt(RECEPTION_PATHS.lookup);
    await screen.findByRole('heading', { name: 'Tra cứu bệnh nhân' });
    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    ).map((element) => element.textContent?.trim());
    // Đổi có duyệt ở patient F4: "Thông tin cá nhân" nay là liên kết nhận focus, đứng sau "Tra cứu bệnh nhân" như thứ tự menu Figma
    expect(focusable).toEqual([
      'CLINIX',
      'Tra cứu bệnh nhân',
      'Thông tin cá nhân',
      'Đăng xuất',
      'Đăng xuất',
    ]);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });
});

// patient F11 (TRACKING F11-G): ngăn kéo màn hẹp của hai khung qua router thật. Các ca trên chạy ở màn rộng (happy-dom 1024px);
// ca dưới giả `matchMedia` ở 390px (afterEach ở đầu file đã gỡ). Mã ca PL-nn tiếp nối là [đề xuất].
describe('màn hẹp của hai khung', () => {
  const openDrawer = async (label: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
    return screen.findByRole('dialog', { name: label });
  };
  const menuLabels = (dialog: HTMLElement) =>
    within(within(dialog).getByRole('navigation', { name: 'Menu chính' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent?.replace(' (chưa được triển khai)', ''));

  it('PL-16 KG-08 Bệnh nhân 390px: không có thanh bên, "Mở menu" mở ngăn kéo "Điều hướng Bệnh nhân" đủ 8 mục; chọn mục thì đóng', async () => {
    fakeMatchMedia(390);
    signedInAs('BenhNhan');
    const router = renderAt(PATIENT_PATHS.profile);
    await screen.findByRole('heading', { name: 'Hồ sơ người khám' });
    expect(screen.queryByRole('complementary')).toBeNull();

    const dialog = await openDrawer('Điều hướng Bệnh nhân');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('Họ tên BenhNhan')).toBeInTheDocument();
    expect(menuLabels(dialog)).toEqual(PATIENT_MENU);
    expect(
      within(dialog).getByRole('link', { name: 'Về trang chủ' }),
    ).toHaveAttribute('href', '/');

    fireEvent.click(
      within(dialog).getByRole('link', { name: 'Hồ sơ người khám' }),
    );
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe(PATIENT_PATHS.profile);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Mở menu' }),
    );
  });

  it('PL-17 KG-08 Lễ tân 390px: ngăn kéo "Điều hướng Lễ tân" đủ 9 mục, không có "Về trang chủ"; Esc đóng', async () => {
    fakeMatchMedia(390);
    signedInAs('LeTan');
    renderAt(RECEPTION_PATHS.lookup);
    await screen.findByRole('heading', { name: 'Tra cứu bệnh nhân' });
    expect(screen.queryByRole('complementary')).toBeNull();

    const dialog = await openDrawer('Điều hướng Lễ tân');
    expect(within(dialog).getByText('Họ tên LeTan')).toBeInTheDocument();
    expect(within(dialog).getByText(ROLE_LABELS.LeTan)).toBeInTheDocument();
    expect(menuLabels(dialog)).toEqual(RECEPTION_MENU);
    expect(
      within(dialog).queryByRole('link', { name: 'Về trang chủ' }),
    ).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('PL-18 KG-05 Bệnh nhân 390px: Đăng xuất trong ngăn kéo bị 500 ⇒ câu lỗi + "Thử lại" trong ngăn kéo; Thử lại về đăng nhập', async () => {
    api.startSession();
    await restoreSession();
    api.failNext('/auth/logout', () => apiError(500, 'LOI_HE_THONG'));
    fakeMatchMedia(390);
    const router = renderAt(PATIENT_PATHS.profile);
    await screen.findByRole('heading', { name: 'Hồ sơ người khám' });

    const dialog = await openDrawer('Điều hướng Bệnh nhân');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đăng xuất' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Không đăng xuất được, vui lòng thử lại');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(router.state.location.pathname).toBe(PATIENT_PATHS.profile);

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(api.logoutCalls).toBe(2);
    // Khung bị gỡ khi ngăn kéo còn mở: khoá cuộn đã nhả
    expect(document.body.style.overflow).toBe('');
  });

  it('PL-19 KG-05 Lễ tân 390px: Đăng xuất ở thanh trên khi ngăn kéo đóng bị 500 ⇒ dải lỗi nhìn thấy; bấm thanh trên rồi nút trong ngăn kéo ⇒ một request', async () => {
    api = createFakeAuthApi({
      vaiTro: 'LeTan',
      hoTen: 'Lễ tân mẫu',
      daXacMinhEmail: true,
    });
    // Đổi có duyệt ở patient F3: trang Hồ sơ người khám thật gọi GET /api/profile (fake auth trả { ok: true } hoặc 401 cho đường dẫn này), nên ca PL-01, PL-01b, PL-04, PL-16, PL-18 cần /profile giả.
    vi.stubGlobal('fetch', vi.fn(createFakeProfileApi(api.fetch).fetch));
    api.startSession();
    await restoreSession();
    expect(getAuthState().user?.vaiTro).toBe('LeTan');
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    api.failNext('/auth/logout', () => apiError(500, 'LOI_HE_THONG'));
    fakeMatchMedia(390);
    const router = renderAt(RECEPTION_PATHS.lookup);
    await screen.findByRole('heading', { name: 'Tra cứu bệnh nhân' });

    // Ngăn kéo đóng: chỉ còn nút Đăng xuất ở thanh trên
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không đăng xuất được, vui lòng thử lại');
    expect(alert.closest('[hidden]')).toBeNull();
    expect(screen.getByRole('banner').parentElement).toContainElement(alert);
    expect(api.logoutCalls).toBe(1);

    const release = api.hold('/auth/logout');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    const dialog = await openDrawer('Điều hướng Lễ tân');
    const inDrawer = within(dialog).getByRole('button', { name: 'Đăng xuất' });
    expect(inDrawer).toBeDisabled();
    fireEvent.click(inDrawer);
    await vi.waitFor(() => expect(api.logoutCalls).toBe(2));
    await act(async () => {
      release(204, null);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(api.logoutCalls).toBe(2);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });
});
