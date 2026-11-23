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
import { LOGIN_PATH } from '../../auth';
import { resetAuthForTest, restoreSession } from '../../auth/auth-session';
import {
  apiError,
  json,
} from '../patient-accounts/testing/patient-accounts-test-kit';
import {
  installFakeStaffApi,
  makeStaff,
  type FakeStaffApi,
} from './testing/staff-accounts-test-kit';

// admin F8 PR2, tạo tài khoản qua khung Admin THẬT (mã NSF8-101 đến 103, 108, 109 là [đề xuất], TRACKING admin 9A.21 mục 3). Dựng `AdminLayout`, `AdminScopeGuard` và `RequireAuth` THẬT
// với API xác thực giả; dữ liệu đi qua API giả có trạng thái của F8 (hợp đồng B15). Phủ NS-03, NS-05, NS-07, NS-08, NS-09 và NS-45 (phía giao diện), và việc hết phiên giữa lúc gửi:
// 401 do lớp bảo vệ toàn cục phát TRƯỚC khi chạm DB nên thử lại một lần không thể tạo trùng. API giả đếm số lần THỰC THI, không chỉ số lần gọi.

const STAFF_PATH = '/admin/nhan-su';
const TITLE = 'Tạo tài khoản nhân sự';
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
    accounts: [makeStaff(1), makeStaff(2, { loaiTaiKhoan: 'LeTan' })],
  });
  const dataFetch = data.fetch;
  const isData = (input: RequestInfo | URL) =>
    /^\/api\/admin\/(accounts|branches|staff-accounts|options)/.test(
      String(input),
    );
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

afterEach(() => {
  vi.unstubAllGlobals();
});

const dialogOf = () => screen.getByRole('dialog', { name: TITLE });
const type = (name: string, value: string) =>
  fireEvent.change(within(dialogOf()).getByLabelText(name), {
    target: { value },
  });
const choose = (name: string, value: string) =>
  fireEvent.change(within(dialogOf()).getByRole('combobox', { name }), {
    target: { value },
  });
const radio = (name: string) => within(dialogOf()).getByRole('radio', { name });
const submit = () =>
  fireEvent.click(
    within(dialogOf()).getByRole('button', { name: 'Tạo tài khoản' }),
  );
const success = () => screen.findByText(/^Tạo tài khoản thành công\./);

async function openCreate() {
  await screen.findByRole('table', { name: 'Danh sách nhân sự' });
  fireEvent.click(screen.getByRole('button', { name: TITLE }));
  return screen.findByRole('dialog', { name: TITLE });
}

function fillReceptionist(branchId?: string) {
  fireEvent.click(radio('Lễ tân'));
  type('Họ tên', 'Lê Văn An');
  type('Email', 'an@example.invalid');
  type('Số điện thoại', '0912345678');
  if (branchId !== undefined) choose('Chi nhánh', branchId);
}

describe('NSF8-101 nút tạo theo vai trò đăng nhập (NS-07, NS-08)', () => {
  it('NSF8-101 Toàn hệ thống: nút có, hộp mở được, ba vai trò đều chọn được', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    renderApp(STAFF_PATH);

    await openCreate();
    for (const name of ['Bác sĩ', 'Lễ tân', 'Quản trị viên'])
      expect(radio(name)).toBeEnabled();
  });

  it('NSF8-101 Chi nhánh: nút có, hộp mở được, Quản trị viên vô hiệu', async () => {
    await startAs('QuanTriVien', 'ChiNhanh');
    auth.failNext('/admin/me', () => json(BRANCH_ME));
    renderApp(STAFF_PATH);

    await openCreate();
    expect(radio('Quản trị viên')).toBeDisabled();
    expect(radio('Bác sĩ')).toBeEnabled();
    expect(radio('Lễ tân')).toBeEnabled();
  });

  it.each(['LeTan', 'BacSi', 'BenhNhan'] as const)(
    'NSF8-101 %s: không vào được màn nên KHÔNG có nút tạo và không gọi API tạo',
    async (vaiTro) => {
      await startAs(vaiTro);
      renderApp(STAFF_PATH);
      await screen.findByRole('heading', { name: 'Không tìm thấy trang' });
      expect(screen.queryByRole('button', { name: TITLE })).toBeNull();
      expect(data.posts()).toHaveLength(0);
    },
  );
});

describe('NSF8-102 thân gửi theo phạm vi của người tạo (NS-03, NS-05)', () => {
  it('NSF8-102 Toàn hệ thống tạo Quản trị viên phạm vi Toàn hệ thống: thân KHÔNG có chiNhanhId', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    renderApp(STAFF_PATH);
    await openCreate();

    fireEvent.click(radio('Quản trị viên'));
    fireEvent.click(radio('Toàn hệ thống'));
    type('Họ tên', 'Lê Văn An');
    type('Email', 'an@example.invalid');
    type('Số điện thoại', '0912345678');
    submit();
    await success();

    expect(data.created).toEqual([
      {
        vaiTro: 'QuanTriVien',
        hoTen: 'Lê Văn An',
        email: 'an@example.invalid',
        soDienThoai: '0912345678',
        phamVi: 'ToanHeThong',
      },
    ]);
  });

  it('NSF8-102 Toàn hệ thống tạo Quản trị viên phạm vi Chi nhánh: thân có chiNhanhId đã chọn', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    renderApp(STAFF_PATH);
    await openCreate();

    fireEvent.click(radio('Quản trị viên'));
    fireEvent.click(radio('Chi nhánh'));
    type('Họ tên', 'Lê Văn An');
    type('Email', 'an@example.invalid');
    type('Số điện thoại', '0912345678');
    await within(dialogOf()).findByRole('combobox', { name: 'Chi nhánh' });
    choose('Chi nhánh', '6');
    submit();
    await success();

    expect(data.created[0]).toMatchObject({
      vaiTro: 'QuanTriVien',
      phamVi: 'ChiNhanh',
      chiNhanhId: '6',
    });
  });

  it('NSF8-102 Chi nhánh tạo Lễ tân: thân mang chi nhánh của họ (cố định, không chọn); danh sách chi nhánh chỉ có chi nhánh của họ', async () => {
    await startAs('QuanTriVien', 'ChiNhanh');
    auth.failNext('/admin/me', () => json(BRANCH_ME));
    renderApp(STAFF_PATH);
    await openCreate();

    fillReceptionist();
    submit();
    await success();

    expect(data.created).toEqual([
      {
        vaiTro: 'LeTan',
        hoTen: 'Lê Văn An',
        email: 'an@example.invalid',
        soDienThoai: '0912345678',
        chiNhanhId: '5',
      },
    ]);
  });
});

describe('NSF8-103 sau khi tạo (NS-19)', () => {
  it('NSF8-103 danh sách tải lại và có dòng mới; "Xem chi tiết" mở panel đúng tài khoản ở cùng trang; đóng panel vẫn ở /admin/nhan-su', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    const router = renderApp(STAFF_PATH);
    await openCreate();
    await within(dialogOf()).findByRole('combobox', { name: 'Chi nhánh' });
    const listsBefore = data.lists().length;

    fillReceptionist('5');
    submit();
    await success();
    await waitFor(() =>
      expect(data.lists().length).toBeGreaterThan(listsBefore),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    const panel = await screen.findByRole('dialog', { name: 'Lê Văn An' });
    expect(
      await within(panel).findByText('an@example.invalid'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Đóng chi tiết' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Lê Văn An' })).toBeNull(),
    );
    expect(router.state.location.pathname).toBe(STAFF_PATH);
    expect(
      await screen.findByRole('button', { name: 'Xem chi tiết Lê Văn An' }),
    ).toBeInTheDocument();
  });
});

describe('NSF8-108 hết phiên giữa lúc gửi: không tạo trùng (NS-09)', () => {
  it('NSF8-108 401 TOKEN_KHONG_HOP_LE ở lần gửi đầu, làm mới thành công, gửi lại MỘT lần: hai lời gọi nhưng đúng MỘT lần THỰC THI, đúng một tài khoản', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    renderApp(STAFF_PATH);
    await openCreate();
    await within(dialogOf()).findByRole('combobox', { name: 'Chi nhánh' });
    // 401 do JwtAuthGuard toàn cục phát TRƯỚC controller: lần gửi này không chạm `create` của API giả
    data.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => apiError(401, 'TOKEN_KHONG_HOP_LE'),
    );
    const refreshBefore = auth.refreshCalls;

    fillReceptionist('5');
    submit();
    await success();

    expect(data.calls('POST', '/admin/staff-accounts')).toHaveLength(2);
    expect(data.created).toHaveLength(1);
    expect(auth.refreshCalls).toBeGreaterThan(refreshBefore);
    expect(
      data.accounts.filter((a) => a.email === 'an@example.invalid'),
    ).toHaveLength(1);
  });
});

describe('NSF8-109 phiên đã hết hẳn và mất mạng (NS-09, NS-45)', () => {
  it('NSF8-109 401 PHIEN_HET_HIEU_LUC: KHÔNG tạo gì, KHÔNG gửi lại, khung Admin đưa về trang đăng nhập', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    const router = renderApp(STAFF_PATH);
    await openCreate();
    await within(dialogOf()).findByRole('combobox', { name: 'Chi nhánh' });
    data.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => apiError(401, 'PHIEN_HET_HIEU_LUC'),
    );

    fillReceptionist('5');
    submit();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(LOGIN_PATH),
    );
    expect(data.created).toHaveLength(0);
    expect(data.calls('POST', '/admin/staff-accounts')).toHaveLength(1);
  });

  it('NSF8-109 mất mạng giữa lúc gửi: KHÔNG tự gửi lại (máy chủ có thể đã tạo), hộp báo "chưa rõ" kèm "Kiểm tra danh sách"', async () => {
    await startAs('QuanTriVien');
    auth.failNext('/admin/me', () => json({ phamVi: 'ToanHeThong' }));
    renderApp(STAFF_PATH);
    await openCreate();
    await within(dialogOf()).findByRole('combobox', { name: 'Chi nhánh' });
    data.override(
      (r) => r.method === 'POST' && r.path === '/admin/staff-accounts',
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    // Mở phiên đã gọi làm mới một lần: đếm phần tăng thêm do lần gửi
    const refreshBefore = auth.refreshCalls;

    fillReceptionist('5');
    submit();

    expect(
      await within(dialogOf()).findByRole('button', {
        name: 'Kiểm tra danh sách',
      }),
    ).toBeInTheDocument();
    expect(data.calls('POST', '/admin/staff-accounts')).toHaveLength(1);
    expect(data.created).toHaveLength(0);
    expect(auth.refreshCalls).toBe(refreshBefore);
  });
});
