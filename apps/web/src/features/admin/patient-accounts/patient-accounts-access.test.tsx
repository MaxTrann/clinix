import {
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
import {
  installFakeApi,
  json,
  makePatient,
  type FakeApi,
} from './testing/patient-accounts-test-kit';

// admin F9, phân quyền phía giao diện (mã TKF9-50 đến 54 là [đề xuất], TRACKING admin 9A.12 mục 3). Dựng cả khung `AdminLayout`, `AdminScopeGuard` và
// `RequireAuth` THẬT với API xác thực giả; dữ liệu tài khoản đi qua API giả có trạng thái của F9 (bộ định tuyến `fetch` ở `startAs`).

const PAGE_PATH = '/admin/tai-khoan-benh-nhan';
// Đổi ở admin F8 (23/11/2026): mục menu trỏ tab Nhân sự; tab Tài khoản bệnh nhân vào qua thanh tab
const MENU_PATH = '/admin/nhan-su';
const MENU_NAME = 'Nhân sự & Tài khoản';

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
let data: FakeApi;

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
  data = installFakeApi({
    scope:
      scope === 'ToanHeThong'
        ? { phamVi: 'ToanHeThong' }
        : {
            phamVi: 'ChiNhanh',
            chiNhanh: { id: '5', ten: 'Chi nhánh Quận 1' },
          },
    accounts: [
      makePatient(1, { khoaDatLichDoNoShow: true, soLanNoShow: 3 }),
      makePatient(2),
    ],
  });
  const dataFetch = data.fetch;
  const isData = (input: RequestInfo | URL) =>
    /^\/api\/admin\/(accounts|branches|system-config)/.test(String(input));
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
  data.requests.filter((request) => request.path.startsWith('/admin/accounts'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TKF9-50 Quản trị viên Toàn hệ thống: có mục menu và thấy đủ chức năng', () => {
  it('TKF9-50 mục "Nhân sự & Tài khoản" là liên kết tới /admin/nhan-su (F8); từ tab "Tài khoản bệnh nhân" mở màn và tải danh sách', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    const router = renderApp('/admin');

    const link = await screen.findByRole('link', { name: MENU_NAME });
    expect(link).toHaveAttribute('href', MENU_PATH);
    fireEvent.click(link);
    fireEvent.click(
      await screen.findByRole('link', { name: 'Tài khoản bệnh nhân' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Tài khoản bệnh nhân',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PAGE_PATH);
    expect(
      await screen.findByRole('table', {
        name: 'Danh sách tài khoản bệnh nhân',
      }),
    ).toBeInTheDocument();
    expect(
      data
        .lists()
        .filter((r) => r.search.getAll('vaiTro').includes('BenhNhan')),
    ).toHaveLength(1);
  });

  it('TKF9-50 mở thẳng đường dẫn: đủ bộ lọc (trạng thái, khoá no-show, chi nhánh), cột "Đặt lịch" và nút "Xem chi tiết"; chi tiết có nút "Mở khoá no-show" ở bệnh nhân bị khoá', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    renderApp(PAGE_PATH);

    const grid = await screen.findByRole('table', {
      name: 'Danh sách tài khoản bệnh nhân',
    });
    expect(
      screen.getByRole('combobox', { name: 'Lọc trạng thái' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Lọc khoá đặt lịch do no-show' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('combobox', { name: 'Lọc chi nhánh' }),
    ).toBeInTheDocument();
    expect(
      within(grid).getByRole('columnheader', { name: 'Đặt lịch' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Xem chi tiết Bệnh nhân 1' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Mở khoá no-show' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Khoá tài khoản' }),
    ).toBeInTheDocument();
  });
});

describe('TKF9-51 Quản trị viên Chi nhánh: vào xem được, không có chức năng của Toàn hệ thống', () => {
  it('TKF9-51 mục menu hiện; vào được; KHÔNG lọc no-show, lọc chi nhánh, cột "Đặt lịch"; chi tiết không có nút hành động', async () => {
    await startAs('QuanTriVien', 'ChiNhanh');
    auth.failNext('/admin/me', () => json(BRANCH_ME));
    renderApp(PAGE_PATH);

    const grid = await screen.findByRole('table', {
      name: 'Danh sách tài khoản bệnh nhân',
    });
    expect(screen.getByRole('link', { name: MENU_NAME })).toHaveAttribute(
      'href',
      MENU_PATH,
    );
    expect(
      screen.queryByRole('combobox', { name: 'Lọc khoá đặt lịch do no-show' }),
    ).toBeNull();
    expect(
      screen.queryByRole('combobox', { name: 'Lọc chi nhánh' }),
    ).toBeNull();
    expect(
      within(grid).queryByRole('columnheader', { name: 'Đặt lịch' }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Xem chi tiết Bệnh nhân 1' }),
    );
    const panel = await screen.findByRole('dialog', { name: 'Bệnh nhân 1' });
    expect(
      within(panel)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Đóng']);
    expect(screen.queryByRole('button', { name: /Khoá|Mở khoá/ })).toBeNull();
    expect(within(panel).getAllByRole('term')).toHaveLength(6);
  });

  it('TKF9-51 mọi lời gọi của Chi nhánh KHÔNG chứa khoaNoShow, chiNhanhId; không gọi chi nhánh, cấu hình; không lời gọi ghi nào', async () => {
    await startAs('QuanTriVien', 'ChiNhanh');
    auth.failNext('/admin/me', () => json(BRANCH_ME));
    renderApp(PAGE_PATH);
    await screen.findByRole('table', { name: 'Danh sách tài khoản bệnh nhân' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc trạng thái' }), {
      target: { value: 'DangHoatDong' },
    });
    await waitFor(() =>
      expect(data.lists().at(-1)?.search.get('trangThai')).toBe('DangHoatDong'),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Xem chi tiết Bệnh nhân 1' }),
    );
    await screen.findByRole('dialog', { name: 'Bệnh nhân 1' });

    for (const request of data.lists()) {
      expect(request.search.has('khoaNoShow')).toBe(false);
      expect(request.search.has('chiNhanhId')).toBe(false);
    }
    expect(data.calls('GET', '/admin/branches')).toHaveLength(0);
    expect(data.calls('GET', '/admin/system-config')).toHaveLength(0);
    expect(data.posts()).toHaveLength(0);
  });
});

describe('TKF9-52 vai trò khác Quản trị viên không vào được', () => {
  it.each(['LeTan', 'BacSi', 'BenhNhan'] as const)(
    'TKF9-52 %s mở /admin/tai-khoan-benh-nhan: trang 404, không có màn, không gọi API tài khoản',
    async (vaiTro) => {
      await startAs(vaiTro);
      renderApp(PAGE_PATH);

      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Tài khoản bệnh nhân' }),
      ).toBeNull();
      await waitFor(() => expect(accountCalls()).toHaveLength(0));
    },
  );
});

describe('TKF9-53 lớp thứ ba: máy chủ vẫn từ chối', () => {
  it('TKF9-53 GET danh sách trả 403 dù giao diện cho vào: câu "Bạn không có quyền…", có "Thử lại", không bảng', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    data.override(
      (r) => r.path === '/admin/accounts',
      () => json({ maLoi: 'KHONG_DU_QUYEN', thongBao: 'câu của API' }, 403),
    );
    renderApp(PAGE_PATH);

    expect(
      await screen.findByText('Bạn không có quyền thực hiện thao tác này.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Danh sách tài khoản bệnh nhân' }),
    ).toBeNull();
  });
});

describe('TKF9-54 các mục menu khác không bị đổi', () => {
  // admin F7 (Trung, 22/11/2026): "Bác sĩ" đã thành liên kết tới màn hồ sơ bác sĩ; phần còn lại của ca giữ nguyên
  it('TKF9-54 mục "Danh sách chờ" vẫn là nút vô hiệu; "Chuyên khoa" và "Bác sĩ" (F7) là liên kết', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    renderApp('/admin');

    await screen.findByRole('link', { name: MENU_NAME });
    expect(screen.getByRole('link', { name: 'Bác sĩ' })).toHaveAttribute(
      'href',
      '/admin/bac-si',
    );
    expect(
      screen.getByRole('button', { name: 'Danh sách chờ' }),
    ).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Chuyên khoa' })).toHaveAttribute(
      'href',
      '/admin/chuyen-khoa',
    );
  });
});
