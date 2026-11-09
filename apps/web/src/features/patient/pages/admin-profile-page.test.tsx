import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import { getAuthState } from '../../auth/auth-store';
import {
  SAMPLE_ADMIN,
  SAMPLE_ADMIN_BRANCH,
  json,
} from '../testing/fake-profile-api';
import {
  ADMIN_BRANCH_NAME,
  adminSidebar,
  renderAdminProfilePage,
} from '../testing/admin-profile-harness';
import {
  renderReceptionProfilePage,
  rowLabels,
  rowValue,
} from '../testing/reception-profile-harness';

// patient F5 (TRACKING F5-E, F5-I): trang "Thông tin cá nhân" của Quản trị viên, chế độ xem, tải và lỗi tải. Mã ca AP-nn là [đề xuất];
// mỗi ca ghi mã HS của PLAN mục 7.1. Chế độ sửa ở `admin-profile-edit.test.tsx`, mục menu và phân quyền ở `admin-profile-routing.test.tsx`.
const BASE_ROWS = [
  'Họ và tên',
  'Email',
  'Số điện thoại',
  'Giới tính',
  'Ngày sinh',
  'Địa chỉ',
];
const SCOPE_ROW = 'Phạm vi quản trị';
const BRANCH_ROW = 'Chi nhánh quản trị';
const ready = () => screen.findByRole('button', { name: 'Chỉnh sửa' });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('mở trang và chế độ xem (HS-17, HS-21)', () => {
  it('AP-01 HS-17 HS-21 mở trang trong khung Admin thật ⇒ đúng MỘT GET /api/profile có Authorization, không gọi người thân; h1, phụ đề của Figma, thẻ "Thông tin cá nhân"', async () => {
    const { profile, adminMe } = await renderAdminProfilePage();
    await ready();

    expect(profile.count('GET')).toBe(1);
    const get = profile.requests.find((request) => request.method === 'GET');
    expect(get?.headers.get('Authorization')).toMatch(/^Bearer tok-/);
    expect(profile.relatives.count('GET')).toBe(0);
    // Khung Admin tự gọi /admin/me đúng một lần; trang KHÔNG gọi thêm (phạm vi lấy từ /profile)
    expect(adminMe.calls).toBe(1);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Thông tin cá nhân' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Thông tin tài khoản quản trị viên.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Quản lý thông tin tài khoản của bạn'),
    ).toBeNull();
    const card = screen.getByRole('region', { name: 'Thông tin cá nhân' });
    expect(
      within(card).getByRole('heading', {
        level: 2,
        name: 'Thông tin cá nhân',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('main', { name: 'Khu vực Admin' }),
    ).toContainElement(screen.getByRole('heading', { level: 1 }));
  });

  it('AP-02 HS-21 Toàn hệ thống: thẻ đầu có tên, dòng phụ "Quản trị viên toàn hệ thống", avatar "AC" aria-hidden; KHÔNG nhãn "Đang hoạt động", không nút máy ảnh', async () => {
    const { container } = await renderAdminProfilePage({ withLayout: false });
    await ready();

    expect(
      screen.getByText('Admin CLINIX', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Quản trị viên toàn hệ thống')).toBeInTheDocument();
    const initials = screen.getByText('AC');
    expect(initials).toHaveAttribute('aria-hidden', 'true');
    expect(initials.closest('button')).toBeNull();
    expect(screen.queryByText('Đang hoạt động')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /ảnh|camera|máy ảnh/i }),
    ).toBeNull();
    expect(container.querySelector('svg.lucide-camera')).toBeNull();
    const card = screen.getByRole('region', { name: 'Thông tin cá nhân' });
    expect(within(card).getAllByRole('button')).toHaveLength(1);
  });

  it('AP-03 HS-21 Chi nhánh: dòng phụ "Quản trị viên chi nhánh" KHÔNG kèm tên chi nhánh (tên chỉ ở hàng "Chi nhánh quản trị"); thanh bên vẫn "Quản trị viên · tên"', async () => {
    await renderAdminProfilePage({ scope: 'ChiNhanh' });
    await ready();

    expect(screen.getByText('Quản trị viên chi nhánh')).toBeInTheDocument();
    expect(screen.queryByText(/Quản trị viên chi nhánh ·/)).toBeNull();
    expect(rowValue(BRANCH_ROW)).toBe(ADMIN_BRANCH_NAME);
    const aside = await adminSidebar();
    expect(
      within(aside).getByText(`Quản trị viên · ${ADMIN_BRANCH_NAME}`),
    ).toBeInTheDocument();
    expect(screen.queryByText('Quản trị viên toàn hệ thống')).toBeNull();
  });

  it('AP-04 HS-17 HS-21 Toàn hệ thống: bảy hàng đúng thứ tự, phạm vi "Toàn hệ thống", KHÔNG có hàng chi nhánh; trường trống "Chưa cập nhật"', async () => {
    await renderAdminProfilePage();
    await ready();

    expect(rowLabels()).toEqual([...BASE_ROWS, SCOPE_ROW]);
    expect(rowValue('Họ và tên')).toBe('Admin CLINIX');
    expect(rowValue('Email')).toBe('admin@example.invalid');
    expect(rowValue('Số điện thoại')).toBe('0954321098');
    expect(rowValue('Giới tính')).toBe('Chưa cập nhật');
    expect(rowValue('Ngày sinh')).toBe('Chưa cập nhật');
    expect(rowValue('Địa chỉ')).toBe('Chưa cập nhật');
    expect(rowValue(SCOPE_ROW)).toBe('Toàn hệ thống');
  });

  it('AP-05 HS-17 HS-21 Chi nhánh: tám hàng đúng thứ tự, phạm vi "Chi nhánh" rồi "Chi nhánh quản trị" = tên chi nhánh', async () => {
    await renderAdminProfilePage({ scope: 'ChiNhanh' });
    await ready();

    expect(rowLabels()).toEqual([...BASE_ROWS, SCOPE_ROW, BRANCH_ROW]);
    expect(rowValue(SCOPE_ROW)).toBe('Chi nhánh');
    expect(rowValue(BRANCH_ROW)).toBe(ADMIN_BRANCH_NAME);
  });

  it('AP-06 HS-17 hồ sơ đầy đủ: ngày dd/mm/yyyy, địa chỉ, giới tính bằng chữ', async () => {
    await renderAdminProfilePage({
      initial: {
        gioiTinh: 'Nu',
        ngaySinh: '1990-05-15',
        diaChi: '12 Đường Mẫu, Quận Một',
      },
    });
    await ready();

    expect(rowValue('Giới tính')).toBe('Nữ');
    expect(rowValue('Ngày sinh')).toBe('15/05/1990');
    expect(rowValue('Địa chỉ')).toBe('12 Đường Mẫu, Quận Một');
  });

  it('AP-07 HS-21 Toàn hệ thống mà API THỪA chiNhanh ⇒ KHÔNG hàng chi nhánh, tên chi nhánh không xuất hiện ở đâu trong trang', async () => {
    await renderAdminProfilePage({
      withLayout: false,
      initial: {
        chiNhanh: { chiNhanhId: '3', ten: 'TÊN CHI NHÁNH THỪA' },
      },
    });
    await ready();

    expect(rowLabels()).not.toContain(BRANCH_ROW);
    expect(screen.queryByText(/TÊN CHI NHÁNH THỪA/)).toBeNull();
    expect(screen.getByText('Quản trị viên toàn hệ thống')).toBeInTheDocument();
  });

  it.each([
    ['mã lạ', 'Khac'],
    ['null', null],
  ])(
    'AP-08 HS-21 phạm vi %s ⇒ trang không vỡ: dòng phụ chỉ "Quản trị viên", hàng phạm vi "Chưa cập nhật", không hàng chi nhánh',
    async (_label, scope) => {
      await renderAdminProfilePage({
        withLayout: false,
        scope: 'ChiNhanh',
        initial: { phamViQuanTri: scope as never },
      });
      await ready();

      expect(screen.getByText('Quản trị viên')).toBeInTheDocument();
      expect(rowValue(SCOPE_ROW)).toBe('Chưa cập nhật');
      expect(rowLabels()).not.toContain(BRANCH_ROW);
      expect(rowValue('Họ và tên')).toBe('Admin CLINIX');
    },
  );

  it('AP-09 HS-21 phạm vi Chi nhánh mà chiNhanh thiếu (hợp đồng lệch) ⇒ không vỡ: hàng chi nhánh "Chưa cập nhật", không chữ "undefined"', async () => {
    const { container } = await renderAdminProfilePage({
      withLayout: false,
      scope: 'ChiNhanh',
      initial: { chiNhanh: null },
    });
    await ready();

    expect(screen.getByText('Quản trị viên chi nhánh')).toBeInTheDocument();
    expect(rowValue(BRANCH_ROW)).toBe('Chưa cập nhật');
    expect(container.textContent).not.toMatch(/undefined|null/);
  });

  it('AP-10 HS-21 chế độ xem KHÔNG có ô sửa nào cho email, phạm vi, chi nhánh; nút duy nhất của thẻ là "Chỉnh sửa"', async () => {
    await renderAdminProfilePage({ scope: 'ChiNhanh' });
    await ready();

    expect(
      screen.queryAllByRole('textbox', { name: /Email|Phạm vi|Chi nhánh/ }),
    ).toHaveLength(0);
    const card = screen.getByRole('region', { name: 'Thông tin cá nhân' });
    expect(card.querySelector('input, select, textarea')).toBeNull();
    expect(within(card).getAllByRole('button')).toHaveLength(1);
  });

  it('AP-11 HS-21 tên 100 ký tự và địa chỉ 255 ký tự hiện đủ ở thẻ đầu và ở hàng, không cắt chữ', async () => {
    const longName = `Nguyễn ${'Thị '.repeat(23)}Lan`.slice(0, 100);
    const longAddress = 'Số 1 Đường Rất Dài '.repeat(14).slice(0, 255);
    await renderAdminProfilePage({
      withLayout: false,
      initial: { hoTen: longName, diaChi: longAddress },
    });
    await ready();

    expect(longName).toHaveLength(100);
    expect(screen.getByText(longName, { selector: 'p' })).toBeInTheDocument();
    expect(rowValue('Họ và tên')).toBe(longName);
    expect(rowValue('Địa chỉ')).toBe(longAddress);
  });

  it('AP-12 HS-17 bề rộng: trang Admin rộng tối đa 630 px (max-w-2xl), trang Lễ tân vẫn 860 px và còn nhãn "Đang hoạt động" sau khi rút chung (ca duy nhất ghim tên lớp)', async () => {
    const admin = await renderAdminProfilePage({ withLayout: false });
    await ready();
    expect(admin.container.querySelector('section')).toHaveClass('max-w-2xl');
    admin.unmount();

    const reception = await renderReceptionProfilePage({ withLayout: false });
    await ready();
    expect(reception.container.querySelector('section')).toHaveClass(
      'max-w-[57.3333rem]',
    );
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    expect(screen.queryByText('Thông tin tài khoản quản trị viên.')).toBeNull();
  });

  it('AP-13 HS-17 khối "Đổi mật khẩu" có mặt dưới thẻ thông tin; KHÔNG có "Bảo mật tài khoản", dòng "demo123"', async () => {
    await renderAdminProfilePage({ withLayout: false });
    await ready();

    const password = screen.getByRole('heading', { name: 'Đổi mật khẩu' });
    const card = screen.getByRole('region', { name: 'Thông tin cá nhân' });
    expect(
      Boolean(
        card.compareDocumentPosition(password) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(screen.queryByText(/Bảo mật tài khoản/)).toBeNull();
    expect(screen.queryByText(/demo123/)).toBeNull();
    expect(screen.queryByText(/Người thân|Hồ sơ người khám/)).toBeNull();
  });
});

describe('đang tải và lỗi tải (HS-17)', () => {
  it('AP-20 HS-17 đang tải: "Đang tải" và h1, chưa có "Chỉnh sửa", khối đổi mật khẩu vẫn có; xong thì hiện hồ sơ', async () => {
    let release: (status: number, body: unknown) => void = () => undefined;
    await renderAdminProfilePage({
      before: ({ profile }) => {
        release = profile.hold('GET');
      },
    });
    await adminSidebar();

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Thông tin cá nhân' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Thông tin cá nhân' }),
    ).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Đổi mật khẩu' }),
    ).toBeInTheDocument();

    release(200, SAMPLE_ADMIN);
    await ready();
    expect(rowValue('Họ và tên')).toBe('Admin CLINIX');
    expect(screen.queryByText(/Đang tải/)).toBeNull();
  });

  it.each([
    [
      'mất mạng',
      () => {
        throw new TypeError('Failed to fetch');
      },
      NETWORK_ERROR_MESSAGE,
    ],
    [
      '500',
      () => json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'CÂU CỦA API' }),
      GENERIC_ERROR_MESSAGE,
    ],
    [
      'chiNhanh sai hình dạng',
      () => json(200, { ...SAMPLE_ADMIN_BRANCH, chiNhanh: 5 }),
      GENERIC_ERROR_MESSAGE,
    ],
  ])(
    'AP-21 HS-17 lỗi tải (%s) ⇒ câu lỗi + "Thử lại" ⇒ GET lần hai ⇒ dữ liệu; h1 và khối đổi mật khẩu vẫn có',
    async (_label, failure, message) => {
      const { profile } = await renderAdminProfilePage({
        withLayout: false,
        before: ({ profile }) => profile.failNext('GET', failure),
      });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(
        screen.getByRole('heading', { level: 1, name: 'Thông tin cá nhân' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Đổi mật khẩu' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();

      fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
      await ready();
      expect(rowValue('Họ và tên')).toBe('Admin CLINIX');
      expect(profile.count('GET')).toBe(2);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('AP-22 HS-17 GET bị 401 PHIEN_HET_HIEU_LUC ⇒ phiên bị xoá bởi hook, trang không hiện thêm câu lỗi', async () => {
    await renderAdminProfilePage({
      withLayout: false,
      before: ({ profile }) =>
        profile.failNext('GET', () =>
          json(401, { maLoi: 'PHIEN_HET_HIEU_LUC', thongBao: 'x' }),
        ),
    });
    await waitFor(() => expect(getAuthState().status).toBe('unauthenticated'));
    expect(getAuthState().sessionEnded).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});

describe('dữ liệu cá nhân (HS-20)', () => {
  it('AP-30 HS-20 xem hồ sơ không gọi console.*, không ghi kho trình duyệt, không đổi tiêu đề tab và URL', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method),
    );
    const titleBefore = document.title;
    const { router } = await renderAdminProfilePage({
      initial: { diaChi: '99 Đường Kín Đáo', ngaySinh: '2000-01-31' },
    });
    await ready();

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.title).toBe(titleBefore);
    const here = router.state.location;
    expect(`${here.pathname}${here.search}${here.hash}`).toBe(
      '/admin/thong-tin-ca-nhan',
    );
    expect(JSON.stringify(here.state ?? null)).not.toMatch(
      /Admin CLINIX|0954321098|Kín Đáo/,
    );
    await act(async () => undefined);
  });
});
