import { render, screen, waitFor, within, act } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { createFakeAuthApi } from '../../../test/fake-auth-api';
import { ROLE_HOME_PATHS, type VaiTro } from '../../auth';
import { resetAuthForTest, restoreSession } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import {
  ADMIN_PATHS,
  RECEPTION_PATHS,
  RECEPTION_PROFILE_SEGMENT,
} from '../patient-paths';
import {
  ADMIN_PROFILE_ROUTES,
  PATIENT_ROUTES,
  RECEPTION_ROUTES,
} from '../patient-routes';
import {
  ADMIN_BRANCH_NAME,
  adminSidebar,
  renderAdminProfilePage,
} from '../testing/admin-profile-harness';
import { createFakeProfileApi } from '../testing/fake-profile-api';

// patient F5 (TRACKING F5-G, F5-I): mục menu "Thông tin cá nhân" của khung Admin, đường dẫn, phân quyền qua router thật. Mã ca AQ-nn là
// [đề xuất]; mỗi ca ghi mã KG, HS của PLAN mục 7.5, 7.1. Trang hồ sơ là route `lazy`: luôn chờ h1 bằng `findBy`.
const menuOf = (aside: HTMLElement) =>
  within(aside).getByRole('navigation', { name: 'Điều hướng Admin' });
const profileLink = (aside: HTMLElement) =>
  within(aside).getByRole('link', { name: 'Thông tin cá nhân' });
const profileH1 = () =>
  screen.findByRole('heading', { level: 1, name: 'Thông tin cá nhân' });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mục menu và đường dẫn của Quản trị viên (KG-04, KG-06)', () => {
  it('AQ-01 KG-04 đường dẫn của mục menu (chữ ghi ở admin-sidebar) = ADMIN_PATHS.profile = /admin + đoạn của route trong ADMIN_PROFILE_ROUTES (không lệch từng chữ)', async () => {
    await renderAdminProfilePage();
    const aside = await adminSidebar();

    const href = profileLink(aside).getAttribute('href');
    expect(href).toBe('/admin/thong-tin-ca-nhan');
    expect(href).toBe(ADMIN_PATHS.profile);
    expect(ADMIN_PROFILE_ROUTES).toHaveLength(1);
    const [route] = ADMIN_PROFILE_ROUTES;
    expect(route.path).toBeDefined();
    expect(route.path?.startsWith('/')).toBe(false);
    expect(href).toBe(`${ROLE_HOME_PATHS.QuanTriVien}/${route.path}`);
    expect(typeof route.lazy).toBe('function');
  });

  it('AQ-02 KG-06 mở thẳng trang: mục có aria-current="page", "Tổng quan" thì không; bốn liên kết cũ giữ nguyên href', async () => {
    const { router } = await renderAdminProfilePage();
    await profileH1();
    expect(router.state.location.pathname).toBe(ADMIN_PATHS.profile);
    expect(router.state.historyAction).toBe('POP');

    const menu = menuOf(await adminSidebar());
    expect(
      within(menu).getByRole('link', { name: 'Thông tin cá nhân' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(menu).getByRole('link', { name: 'Tổng quan' }),
    ).not.toHaveAttribute('aria-current');
    expect(
      within(menu).getByRole('link', { name: 'Chuyên khoa' }),
    ).toHaveAttribute('href', '/admin/chuyen-khoa');
    expect(
      within(menu).getByRole('link', { name: 'Loại dịch vụ khám' }),
    ).toHaveAttribute('href', '/admin/dich-vu-kham');
    expect(
      within(menu).getByRole('link', { name: 'Thông tin phòng khám' }),
    ).toHaveAttribute('href', '/admin/thong-tin-phong-kham');
  });

  it('AQ-03 KG-04 chỉ mục này đổi từ nút vô hiệu thành liên kết: sáu liên kết, mọi nút còn lại vô hiệu, "Thông báo" ngay trên vẫn vô hiệu; nhãn và thứ tự nhóm "Tài khoản" không đổi', async () => {
    await renderAdminProfilePage();
    const menu = menuOf(await adminSidebar());

    const links = within(menu)
      .getAllByRole('link')
      .map((link) => link.textContent);
    // Đổi có duyệt ở doctor F6: "Lịch làm việc bác sĩ" (nhóm Vận hành) có trang nên là liên kết, đứng sau "Tổng quan" theo thứ tự menu
    expect(links).toEqual([
      'Tổng quan',
      'Lịch làm việc bác sĩ',
      'Chuyên khoa',
      'Thông tin phòng khám',
      'Loại dịch vụ khám',
      'Thông tin cá nhân',
    ]);
    const buttons = within(menu).getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(
      within(menu).queryByRole('button', { name: 'Thông tin cá nhân' }),
    ).toBeNull();
    expect(
      within(menu).getByRole('button', { name: 'Thông báo' }),
    ).toHaveAttribute('title', 'Chưa được triển khai');
    const group = within(menu)
      .getByRole('heading', { name: 'Tài khoản' })
      .closest('section');
    expect(
      within(group as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Thông báo', 'Thông tin cá nhân']);
  });

  it('AQ-04 KG-04 bấm mục từ trang tổng quan ⇒ mở đúng trang hồ sơ, đúng một GET /api/profile, mục chuyển sang đang chọn', async () => {
    const { profile, router } = await renderAdminProfilePage({
      path: ROLE_HOME_PATHS.QuanTriVien,
    });
    const menu = menuOf(await adminSidebar());
    expect(profile.count('GET')).toBe(0);
    expect(
      within(menu).getByRole('link', { name: 'Tổng quan' }),
    ).toHaveAttribute('aria-current', 'page');

    await act(async () => {
      profileLink(menu).click();
    });

    await profileH1();
    expect(router.state.location.pathname).toBe(ADMIN_PATHS.profile);
    expect(profile.count('GET')).toBe(1);
    expect(profileLink(menu)).toHaveAttribute('aria-current', 'page');
    expect(
      within(menu).getByRole('link', { name: 'Tổng quan' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('AQ-05 KG-04 /admin vẫn là tổng quan (không chuyển hướng, không gọi /api/profile)', async () => {
    const { profile, router } = await renderAdminProfilePage({
      path: ROLE_HOME_PATHS.QuanTriVien,
    });
    await adminSidebar();

    expect(router.state.location.pathname).toBe('/admin');
    expect(profile.count('GET')).toBe(0);
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Thông tin cá nhân' }),
    ).toBeNull();
  });

  it('AQ-06 KG-06 QUAY LẠI: sang tổng quan rồi Back ⇒ GET mới, mục lại là mục đang chọn, chế độ xem', async () => {
    const { profile, router } = await renderAdminProfilePage();
    await screen.findByRole('button', { name: 'Chỉnh sửa' });
    const menu = menuOf(await adminSidebar());

    await act(() => router.navigate(ROLE_HOME_PATHS.QuanTriVien));
    expect(profileLink(menu)).not.toHaveAttribute('aria-current');
    await act(() => router.navigate(-1));

    await screen.findByRole('button', { name: 'Chỉnh sửa' });
    expect(profile.count('GET')).toBe(2);
    expect(profileLink(menu)).toHaveAttribute('aria-current', 'page');
  });
});

describe('hai phạm vi Quản trị viên (HS-21)', () => {
  it('AQ-10 HS-21 Toàn hệ thống mở thẳng URL ⇒ thẻ đầu "Quản trị viên toàn hệ thống", thanh bên "Quản trị viên"', async () => {
    await renderAdminProfilePage();
    await profileH1();
    const aside = await adminSidebar();

    expect(screen.getByText('Quản trị viên toàn hệ thống')).toBeInTheDocument();
    expect(within(aside).getByText('Quản trị viên')).toBeInTheDocument();
    expect(within(aside).getByText('Cài đặt hệ thống')).toBeInTheDocument();
  });

  it('AQ-11 HS-21 Chi nhánh mở thẳng URL ⇒ thẻ đầu "Quản trị viên chi nhánh", thanh bên "Quản trị viên · tên chi nhánh", mục chỉ Toàn hệ thống ẩn, vẫn thấy mục hồ sơ', async () => {
    await renderAdminProfilePage({ scope: 'ChiNhanh' });
    await profileH1();
    const aside = await adminSidebar();

    expect(screen.getByText('Quản trị viên chi nhánh')).toBeInTheDocument();
    expect(
      within(aside).getByText(`Quản trị viên · ${ADMIN_BRANCH_NAME}`),
    ).toBeInTheDocument();
    expect(within(aside).queryByText('Cài đặt hệ thống')).toBeNull();
    expect(profileLink(aside)).toHaveAttribute('href', ADMIN_PATHS.profile);
  });
});

async function signedInAs(vaiTro: VaiTro) {
  resetAuthForTest();
  const auth = createFakeAuthApi({
    vaiTro,
    hoTen: `Họ tên ${vaiTro}`,
    daXacMinhEmail: true,
  });
  const profile = createFakeProfileApi(auth.fetch);
  vi.stubGlobal('fetch', vi.fn(profile.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  auth.startSession();
  await restoreSession();
  return { auth, profile };
}
function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ['/', path],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('phân quyền của đường dẫn Admin (KG-03)', () => {
  it.each(['BenhNhan', 'LeTan', 'BacSi'] as const)(
    'AQ-20 KG-03 %s mở /admin/thong-tin-ca-nhan ⇒ 404, không khung Admin, không gọi /api/profile',
    async (vaiTro) => {
      const { profile } = await signedInAs(vaiTro);
      const router = renderAt(ADMIN_PATHS.profile);

      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(ADMIN_PATHS.profile);
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Admin' }),
      ).toBeNull();
      expect(
        screen.queryByRole('heading', { level: 1, name: 'Thông tin cá nhân' }),
      ).toBeNull();
      expect(profile.count('GET')).toBe(0);
    },
  );

  it('AQ-21 KG-03 khách mở /admin/thong-tin-ca-nhan ⇒ về /dang-nhap bằng replace, không lộ khung, không gọi /api/profile', async () => {
    setAuthState({ status: 'unauthenticated' });
    const auth = createFakeAuthApi();
    const profile = createFakeProfileApi(auth.fetch);
    vi.stubGlobal('fetch', vi.fn(profile.fetch));
    const router = renderAt(ADMIN_PATHS.profile);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(
      screen.queryByRole('complementary', { name: 'Điều hướng Admin' }),
    ).toBeNull();
    expect(profile.count('GET')).toBe(0);
  });

  it('AQ-22 KG-03 Quản trị viên mở /le-tan/thong-tin-ca-nhan ⇒ 404 (không lẫn route Lễ tân), không khung Lễ tân', async () => {
    const { profile } = await signedInAs('QuanTriVien');
    const router = renderAt(RECEPTION_PATHS.profile);

    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(RECEPTION_PATHS.profile);
    expect(
      screen.queryByRole('complementary', { name: 'Điều hướng Lễ tân' }),
    ).toBeNull();
    expect(profile.count('GET')).toBe(0);
  });

  it('AQ-23 KG-03 hai khu có cùng đoạn "thong-tin-ca-nhan" mà route không lẫn: ADMIN_PROFILE_ROUTES ngoài RECEPTION_ROUTES và PATIENT_ROUTES', () => {
    const pathsOf = (routes: { path?: string }[]) =>
      routes.map((route) => route.path);
    expect(pathsOf(RECEPTION_ROUTES)).toEqual([
      'tra-cuu-benh-nhan',
      RECEPTION_PROFILE_SEGMENT,
    ]);
    expect(pathsOf(PATIENT_ROUTES)).toEqual(['ho-so-nguoi-kham']);
    expect(RECEPTION_ROUTES).not.toContain(ADMIN_PROFILE_ROUTES[0]);
    expect(ADMIN_PROFILE_ROUTES[0].path).toBe(RECEPTION_PROFILE_SEGMENT);
    expect(ADMIN_PATHS.profile).not.toBe(RECEPTION_PATHS.profile);
  });
});
