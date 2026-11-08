import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import type { VaiTro } from '../../auth';
import { setAuthState } from '../../auth/auth-store';
import {
  PATIENT_PATHS,
  RECEPTION_PATHS,
  RECEPTION_PROFILE_SEGMENT,
} from '../patient-paths';
import { SAMPLE_RECEPTIONIST } from '../testing/fake-profile-api';
import { setUpApi } from '../testing/profile-page-harness';

// patient F4 (TRACKING F4-G, F4-H): mục menu "Thông tin cá nhân", đường dẫn và phân quyền qua router thật. Mã ca TT-nn là [đề xuất];
// mỗi ca ghi mã KG, HS của PLAN mục 7.5, 7.1. Trang hồ sơ là route `lazy`: luôn chờ h1 bằng `findBy`.
function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ['/', path],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

const aside = () =>
  screen.findByRole('complementary', { name: 'Điều hướng Lễ tân' });
const menuOf = (shell: HTMLElement) =>
  within(shell).getByRole('navigation', { name: 'Menu chính' });
const profileH1 = () =>
  screen.findByRole('heading', { level: 1, name: 'Thông tin cá nhân' });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Lễ tân vào "Thông tin cá nhân" (KG-04, KG-06, HS-21)', () => {
  it('TT-60 KG-06 mở thẳng /le-tan/thong-tin-ca-nhan: không bị chuyển hướng, có trang; mục menu là liên kết đang chọn (aria-current), "Tra cứu bệnh nhân" thì không', async () => {
    const { profile } = await setUpApi({ ...SAMPLE_RECEPTIONIST }, [], 'LeTan');
    const router = renderAt(RECEPTION_PATHS.profile);

    await profileH1();
    expect(router.state.location.pathname).toBe(RECEPTION_PATHS.profile);
    expect(router.state.historyAction).toBe('POP');
    expect(profile.count('GET')).toBe(1);

    const menu = menuOf(await aside());
    const link = within(menu).getByRole('link', { name: 'Thông tin cá nhân' });
    expect(link).toHaveAttribute('href', RECEPTION_PATHS.profile);
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(
      within(menu).getByRole('link', { name: 'Tra cứu bệnh nhân' }),
    ).not.toHaveAttribute('aria-current');
    // Thẻ người dùng của thanh bên: họ tên và "Lễ tân"
    expect(
      within(await aside()).getByText('Lê Thị Lệ Ngân'),
    ).toBeInTheDocument();
  });

  it('TT-61 KG-04 đường dẫn đã chốt (Q21g): hằng đúng chữ, mục menu trỏ đúng hằng', () => {
    expect(RECEPTION_PROFILE_SEGMENT).toBe('thong-tin-ca-nhan');
    expect(RECEPTION_PATHS.profile).toBe('/le-tan/thong-tin-ca-nhan');
  });

  it('TT-62 KG-06 /le-tan vẫn chuyển tới "Tra cứu bệnh nhân" (không gọi /api/profile); bấm menu sang "Thông tin cá nhân" rồi quay lại: mục đang chọn đổi theo', async () => {
    const { profile } = await setUpApi({ ...SAMPLE_RECEPTIONIST }, [], 'LeTan');
    const router = renderAt(RECEPTION_PATHS.root);

    await screen.findByRole('heading', { name: 'Tra cứu bệnh nhân' });
    expect(router.state.location.pathname).toBe(RECEPTION_PATHS.lookup);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(profile.count('GET')).toBe(0);
    const menu = menuOf(await aside());
    expect(
      within(menu).getByRole('link', { name: 'Tra cứu bệnh nhân' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(menu).getByRole('link', { name: 'Thông tin cá nhân' }),
    ).not.toHaveAttribute('aria-current');

    fireEvent.click(
      within(menu).getByRole('link', { name: 'Thông tin cá nhân' }),
    );
    await profileH1();
    expect(router.state.location.pathname).toBe(RECEPTION_PATHS.profile);
    expect(
      within(menu).getByRole('link', { name: 'Thông tin cá nhân' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(menu).getByRole('link', { name: 'Tra cứu bệnh nhân' }),
    ).not.toHaveAttribute('aria-current');
    expect(profile.count('GET')).toBe(1);

    fireEvent.click(
      within(menu).getByRole('link', { name: 'Tra cứu bệnh nhân' }),
    );
    await screen.findByRole('heading', { name: 'Tra cứu bệnh nhân' });
    expect(router.state.location.pathname).toBe(RECEPTION_PATHS.lookup);
    expect(
      within(menu).getByRole('link', { name: 'Thông tin cá nhân' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('TT-63 HS-17 trang hồ sơ trong khung thật có đủ: thẻ thông tin, khối "Đổi mật khẩu"; khung và trang cùng một DOM (một h1)', async () => {
    await setUpApi({ ...SAMPLE_RECEPTIONIST }, [], 'LeTan');
    renderAt(RECEPTION_PATHS.profile);

    await profileH1();
    await screen.findByRole('button', { name: 'Chỉnh sửa' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('region', { name: 'Thông tin cá nhân' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Đổi mật khẩu' }),
    ).toBeInTheDocument();
    // Cạnh menu chỉ còn 7 mục vô hiệu (F2 có 8, F4 mở thêm 1)
    const disabled = within(menuOf(await aside())).getAllByRole('button');
    expect(disabled).toHaveLength(7);
    for (const button of disabled) expect(button).toBeDisabled();
  });
});

describe('vai trò khác và khách (KG-03)', () => {
  it.each([
    ['BenhNhan', 'Bệnh nhân'],
    ['BacSi', 'Bác sĩ'],
    ['QuanTriVien', 'Quản trị viên'],
  ] as [VaiTro, string][])(
    'TT-64 KG-03 %s mở /le-tan/thong-tin-ca-nhan ⇒ 404 của gốc, không khung Lễ tân, không trang hồ sơ, không gọi /api/profile',
    async (vaiTro) => {
      const { profile } = await setUpApi({}, []);
      setAuthState({
        status: 'authenticated',
        user: { vaiTro, hoTen: `Họ tên ${vaiTro}`, daXacMinhEmail: true },
      });
      const router = renderAt(RECEPTION_PATHS.profile);

      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(RECEPTION_PATHS.profile);
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Lễ tân' }),
      ).toBeNull();
      expect(
        screen.queryByRole('heading', { level: 1, name: 'Thông tin cá nhân' }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();
      expect(profile.count('GET')).toBe(0);
    },
  );

  it('TT-65 KG-03 khách mở /le-tan/thong-tin-ca-nhan ⇒ về /dang-nhap bằng replace, không lộ khung, không gọi /api/profile', async () => {
    const { profile } = await setUpApi({}, [], 'LeTan');
    setAuthState({ status: 'unauthenticated' });
    const router = renderAt(RECEPTION_PATHS.profile);

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(
      screen.queryByRole('complementary', { name: 'Điều hướng Lễ tân' }),
    ).toBeNull();
    expect(profile.count('GET')).toBe(0);
  });

  it('TT-66 KG-01 trang Bệnh nhân không đổi: /benh-nhan/ho-so-nguoi-kham vẫn là "Hồ sơ người khám", menu Bệnh nhân không có "Thông tin cá nhân"', async () => {
    await setUpApi({}, [], 'BenhNhan');
    renderAt(PATIENT_PATHS.profile);

    await screen.findByRole('heading', { level: 1, name: 'Hồ sơ người khám' });
    const shell = await screen.findByRole('complementary', {
      name: 'Điều hướng Bệnh nhân',
    });
    expect(
      within(shell).queryByRole('link', { name: 'Thông tin cá nhân' }),
    ).toBeNull();
    expect(
      within(shell).queryByRole('button', { name: /^Thông tin cá nhân/ }),
    ).toBeNull();
  });
});
