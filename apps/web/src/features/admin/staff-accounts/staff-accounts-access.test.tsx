import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../router/routes';
import { createFakeAuthApi } from '../../../test/fake-auth-api';
import { resetAuthForTest, restoreSession } from '../../auth/auth-session';
import { json } from '../patient-accounts/testing/patient-accounts-test-kit';
import {
  installFakeStaffApi,
  makeAdmin,
  makeStaff,
  type FakeStaffApi,
} from './testing/staff-accounts-test-kit';

// admin F8, phân quyền phía giao diện (mã NSF8-53 đến 58 là [đề xuất], TRACKING admin 9A.20 mục 3). Dựng cả khung `AdminLayout`, `AdminScopeGuard` và `RequireAuth`
// THẬT với API xác thực giả; dữ liệu tài khoản đi qua API giả có trạng thái của F8 (bộ định tuyến `fetch` ở `startAs`). Phủ TK-02, TK-23, TK-26.

const STAFF_PATH = '/admin/nhan-su';
const PATIENTS_PATH = '/admin/tai-khoan-benh-nhan';
const MENU_NAME = 'Nhân sự & Tài khoản';
const TABLE = 'Danh sách nhân sự';

const BRANCH_ME = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '5', ten: 'Chi nhánh Quận 1' },
};

function renderApp(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

let auth: ReturnType<typeof createFakeAuthApi>;
let data: FakeStaffApi;

function startAs(
  vaiTro: 'QuanTriVien' | 'LeTan' | 'BacSi' | 'BenhNhan',
  scope: 'ToanHeThong' | 'ChiNhanh' = 'ToanHeThong',
) {
  resetAuthForTest();
  auth = createFakeAuthApi({
    vaiTro,
    hoTen: 'Người dùng thử',
    daXacMinhEmail: true,
  });
  data = installFakeStaffApi({
    scope:
      scope === 'ToanHeThong'
        ? { phamVi: 'ToanHeThong' }
        : {
            phamVi: 'ChiNhanh',
            chiNhanh: { id: '5', ten: 'Chi nhánh Quận 1' },
          },
    accounts: [
      makeStaff(1),
      makeStaff(2, { loaiTaiKhoan: 'LeTan' }),
      makeAdmin(3, 'ToanHeThong'),
    ],
  });
  const dataFetch = data.fetch;
  const isData = (input: RequestInfo | URL) =>
    /^\/api\/admin\/(accounts|branches)/.test(String(input));
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      isData(input) ? dataFetch(input, init) : auth.fetch(input, init),
    ),
  );
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  auth.startSession();
  return restoreSession();
}

const accountCalls = () =>
  data.requests.filter((r) => r.path.startsWith('/admin/accounts'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NSF8-53 Quản trị viên Toàn hệ thống: mục menu trỏ tab Nhân sự và chuyển qua lại hai tab', () => {
  it('NSF8-53 mục "Nhân sự & Tài khoản" là liên kết tới /admin/nhan-su; bấm vào thì mở màn và tải danh sách', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    const router = renderApp('/admin');

    const link = await screen.findByRole('link', { name: MENU_NAME });
    expect(link).toHaveAttribute('href', STAFF_PATH);
    fireEvent.click(link);

    expect(
      await screen.findByRole('heading', { name: 'Nhân sự', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(STAFF_PATH);
    expect(
      await screen.findByRole('table', { name: TABLE }),
    ).toBeInTheDocument();
    expect(data.lists()).toHaveLength(1);
  });

  it('NSF8-53 mở thẳng đường dẫn: đủ bộ lọc (vai trò Quản trị viên, trạng thái, chi nhánh) và dòng của Quản trị viên', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    renderApp(STAFF_PATH);

    const grid = await screen.findByRole('table', { name: TABLE });
    expect(
      within(screen.getByRole('combobox', { name: 'Lọc vai trò' })).getByRole(
        'option',
        { name: 'Quản trị viên' },
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('combobox', { name: 'Lọc chi nhánh' }),
    ).toBeInTheDocument();
    expect(within(grid).getByText('Quản trị 3')).toBeInTheDocument();
  });

  it('NSF8-53 hai tab chuyển qua lại: aria-current đổi theo trang, mỗi trang giữ tiêu đề riêng', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    const router = renderApp(STAFF_PATH);
    await screen.findByRole('table', { name: TABLE });

    const tabs = () =>
      screen.getByRole('navigation', { name: 'Nhân sự và tài khoản' });
    fireEvent.click(
      within(tabs()).getByRole('link', { name: 'Tài khoản bệnh nhân' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Tài khoản bệnh nhân',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATIENTS_PATH);
    expect(
      within(tabs()).getByRole('link', { name: 'Tài khoản bệnh nhân' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(tabs()).getByRole('link', { name: 'Nhân sự' }),
    ).not.toHaveAttribute('aria-current');

    fireEvent.click(within(tabs()).getByRole('link', { name: 'Nhân sự' }));
    expect(
      await screen.findByRole('heading', { name: 'Nhân sự', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(STAFF_PATH);
  });
});

describe('NSF8-54 mục menu sáng ở cả hai tab (Đại duyệt 23/11/2026)', () => {
  it('NSF8-54 mục "Nhân sự & Tài khoản" có cùng kiểu "đang chọn" ở /admin/nhan-su và /admin/tai-khoan-benh-nhan, và khác kiểu ở trang khác', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    const router = renderApp(STAFF_PATH);
    const link = () => screen.getByRole('link', { name: MENU_NAME });
    await screen.findByRole('table', { name: TABLE });
    const onStaff = link().className;
    expect(link()).toHaveAttribute('aria-current', 'page');

    await act(() => router.navigate(PATIENTS_PATH));
    await screen.findByRole('heading', { name: 'Tài khoản bệnh nhân' });
    expect(link().className).toBe(onStaff);

    // Trang tổng quan không gọi API tài khoản; chỉ cần mục menu thôi sáng
    await act(() => router.navigate('/admin'));
    await waitFor(() => expect(link()).not.toHaveAttribute('aria-current'));
    expect(link().className).not.toBe(onStaff);
  });
});

describe('NSF8-55 Quản trị viên Chi nhánh: vào xem được, chỉ Bác sĩ và Lễ tân của chi nhánh mình (TK-02, L9)', () => {
  it('NSF8-55 mục menu hiện; vào được; KHÔNG lọc chi nhánh, KHÔNG lựa chọn Quản trị viên, KHÔNG dòng Quản trị viên', async () => {
    await startAs('QuanTriVien', 'ChiNhanh');
    auth.failNext('/admin/me', () => json(BRANCH_ME));
    renderApp(STAFF_PATH);

    const grid = await screen.findByRole('table', { name: TABLE });
    expect(screen.getByRole('link', { name: MENU_NAME })).toHaveAttribute(
      'href',
      STAFF_PATH,
    );
    expect(
      screen.queryByRole('combobox', { name: 'Lọc chi nhánh' }),
    ).toBeNull();
    expect(
      within(screen.getByRole('combobox', { name: 'Lọc vai trò' })).queryByRole(
        'option',
        { name: 'Quản trị viên' },
      ),
    ).toBeNull();
    expect(within(grid).queryByText('Quản trị 3')).toBeNull();
    expect(
      screen.getByText('Chi nhánh của bạn: Chi nhánh Quận 1'),
    ).toBeInTheDocument();
  });

  it('NSF8-55 mọi lời gọi của Chi nhánh KHÔNG có vaiTro=QuanTriVien và KHÔNG có chiNhanhId; không gọi danh sách chi nhánh', async () => {
    await startAs('QuanTriVien', 'ChiNhanh');
    auth.failNext('/admin/me', () => json(BRANCH_ME));
    renderApp(STAFF_PATH);
    await screen.findByRole('table', { name: TABLE });
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc trạng thái' }), {
      target: { value: 'DangHoatDong' },
    });
    await waitFor(() =>
      expect(data.lists().at(-1)?.search.get('trangThai')).toBe('DangHoatDong'),
    );

    for (const request of data.lists()) {
      expect(request.search.getAll('vaiTro')).not.toContain('QuanTriVien');
      expect(request.search.has('chiNhanhId')).toBe(false);
    }
    expect(data.calls('GET', '/admin/branches')).toHaveLength(0);
    expect(data.posts()).toHaveLength(0);
  });
});

describe('NSF8-56 vai trò khác Quản trị viên không vào được (TK-23)', () => {
  it.each(['LeTan', 'BacSi', 'BenhNhan'] as const)(
    'NSF8-56 %s mở /admin/nhan-su: trang 404, không có màn, không gọi API tài khoản',
    async (vaiTro) => {
      await startAs(vaiTro);
      renderApp(STAFF_PATH);

      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Nhân sự' })).toBeNull();
      await waitFor(() => expect(accountCalls()).toHaveLength(0));
    },
  );
});

describe('NSF8-57 lớp thứ ba: máy chủ vẫn từ chối', () => {
  it('NSF8-57 GET danh sách trả 403 dù giao diện cho vào: câu "Bạn không có quyền…", có "Thử lại", không bảng', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    data.override(
      (r) => r.path === '/admin/accounts',
      () => json({ maLoi: 'KHONG_DU_QUYEN', thongBao: 'câu của API' }, 403),
    );
    renderApp(STAFF_PATH);

    expect(
      await screen.findByText('Bạn không có quyền thực hiện thao tác này.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: TABLE })).toBeNull();
  });
});

describe('NSF8-58 các mục menu khác không bị đổi', () => {
  it('NSF8-58 "Bác sĩ" vẫn trỏ /admin/bac-si, "Chuyên khoa" vẫn trỏ /admin/chuyen-khoa; "Danh sách chờ" vẫn vô hiệu', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    renderApp('/admin');

    await screen.findByRole('link', { name: MENU_NAME });
    expect(screen.getByRole('link', { name: 'Bác sĩ' })).toHaveAttribute(
      'href',
      '/admin/bac-si',
    );
    expect(screen.getByRole('link', { name: 'Chuyên khoa' })).toHaveAttribute(
      'href',
      '/admin/chuyen-khoa',
    );
    expect(
      screen.getByRole('button', { name: 'Danh sách chờ' }),
    ).toBeDisabled();
  });
});
