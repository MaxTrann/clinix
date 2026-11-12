import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { resetAuthForTest, restoreSession } from '../../../auth/auth-session';
import { setAuthState } from '../../../auth/auth-store';
import type { AdminMe } from '../../../admin';
import { createAppRoutes } from '../../../../router/routes';
import { createFakeAuthApi } from '../../../../test/fake-auth-api';
import type {
  ReceptionDoctor,
  ReceptionDoctorRow,
  ReceptionShift,
} from '../../api/reception-api';
import { jsonResponse } from '../../testing/fetch-routing';
import { ADMIN_SCHEDULE_PATH } from './admin-schedule-paths';

// doctor F6: WA-01 (lưới Admin: Toàn hệ thống lọc chi nhánh / Chi nhánh chip cố định), WA-14 (banner yêu cầu chờ duyệt). Hộp Phân công, ô "+" (WA-05)
// và Gỡ ca là F7: xem `assign/assign-dialog.test.tsx`. Hôm nay = thứ Tư 14/10/2026 giờ VN.
const Q3 = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' };
const Q7 = { chiNhanhId: '2', ten: 'CLINIX Chi nhánh Quận 7' };
const DOCTOR_A: ReceptionDoctor = {
  bacSiId: '11',
  hoTen: 'ThS.BS. Nguyễn Minh Anh',
  ngungHoatDong: false,
  chiNhanh: Q3,
  chuyenKhoa: { chuyenKhoaId: '5', ten: 'Tim mạch' },
};
const DOCTOR_B: ReceptionDoctor = {
  bacSiId: '12',
  hoTen: 'BS. Lê Thảo Vy',
  ngungHoatDong: false,
  chiNhanh: Q7,
  chuyenKhoa: { chuyenKhoaId: '6', ten: 'Nhi khoa' },
};

function shift(overrides: Partial<ReceptionShift>): ReceptionShift {
  return {
    lichLamViecId: '1',
    chiNhanh: Q3,
    ngay: '2026-10-12',
    ca: 'CaSang',
    batDau: '08:30',
    ketThuc: '11:30',
    gioCaKhongCon: false,
    nghiPhep: null,
    ...overrides,
  };
}

const ROWS: ReceptionDoctorRow[] = [
  {
    ...DOCTOR_A,
    ca: [
      shift({ ngay: '2026-10-12' }),
      shift({ lichLamViecId: '2', ngay: '2026-10-13', nghiPhep: 'ChoDuyet' }),
    ],
  },
  {
    ...DOCTOR_B,
    ca: [
      shift({
        lichLamViecId: '3',
        chiNhanh: Q7,
        ngay: '2026-10-14',
        ca: 'CaChieu',
        batDau: '13:30',
        ketThuc: '17:00',
      }),
    ],
  },
];

const fetchMock = vi.fn<typeof fetch>();
let api: ReturnType<typeof createFakeAuthApi>;
let scope: AdminMe;
let gridResponse: () => Response;
let pendingResponse: () => Response | Promise<Response>;

const grid = (rows = ROWS) =>
  jsonResponse({
    tuNgay: '',
    denNgay: '',
    items: rows,
    total: rows.length,
    page: 1,
    pageSize: 50,
  });

function callsTo(pathEnd: string) {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.endsWith(pathEnd));
}

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi({
    vaiTro: 'QuanTriVien',
    hoTen: 'Admin CLINIX',
    daXacMinhEmail: true,
  });
  scope = { phamVi: 'ToanHeThong' };
  gridResponse = () => grid();
  pendingResponse = () =>
    jsonResponse({ items: [], total: 0, page: 1, pageSize: 1, thongKe: {} });
  fetchMock.mockReset();
  fetchMock.mockImplementation((input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/admin/me'))
      return Promise.resolve(jsonResponse(scope));
    if (url.pathname.endsWith('/admin/doctor-shifts/doctors'))
      return Promise.resolve(
        jsonResponse({
          items: [DOCTOR_A, DOCTOR_B],
          total: 2,
          page: 1,
          pageSize: 100,
        }),
      );
    if (url.pathname.endsWith('/admin/doctor-shifts'))
      return Promise.resolve(gridResponse());
    if (url.pathname.endsWith('/admin/leave-requests'))
      return Promise.resolve(pendingResponse());
    return api.fetch(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderAdmin(
  adminScope: AdminMe = { phamVi: 'ToanHeThong' },
  search = '',
) {
  scope = adminScope;
  api.startSession();
  await restoreSession();
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [`${ADMIN_SCHEDULE_PATH}${search}`],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const BRANCH_ADMIN: AdminMe = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '1', ten: 'CLINIX Chi nhánh Quận 3' },
};

describe('lưới Admin Toàn hệ thống (F6)', () => {
  it('WA-01 lưới: tiêu đề, menu sáng, chi nhánh ở từng bác sĩ, ô đúng trạng thái; gọi /admin/doctor-shifts', async () => {
    await renderAdmin();
    const table = await screen.findByRole('table', {
      name: /Lịch làm việc của các bác sĩ/,
    });
    expect(
      screen.getByRole('heading', { name: 'Lịch làm việc bác sĩ' }),
    ).toBeVisible();
    const link = within(
      screen.getByRole('complementary', { name: 'Điều hướng Admin' }),
    ).getByRole('link', { name: 'Lịch làm việc bác sĩ' });
    expect(link).toHaveAttribute('href', ADMIN_SCHEDULE_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
    // Tên chi nhánh bên phải tên bác sĩ (Figma 515:2)
    const rowA = within(table)
      .getByText('ThS.BS. Nguyễn Minh Anh')
      .closest('th')!;
    expect(rowA).toHaveTextContent('CLINIX Chi nhánh Quận 3');
    expect(
      within(table).getByText('BS. Lê Thảo Vy').closest('th'),
    ).toHaveTextContent('CLINIX Chi nhánh Quận 7');
    expect(
      within(table).getByRole('button', {
        name: /Nguyễn Minh Anh, Ca sáng, Thứ 2, 12\/10\/2026, Làm việc/,
      }),
    ).toBeVisible();
    expect(
      within(table).getByRole('button', {
        name: /Thứ 3, 13\/10\/2026, Chờ duyệt/,
      }),
    ).toBeVisible();
    expect(callsTo('/admin/doctor-shifts').length).toBeGreaterThan(0);
    expect(callsTo('/reception/doctor-schedules')).toHaveLength(0);
    // Không phải trang chỉ xem của Lễ tân
    expect(screen.queryByText(/chỉ để xem/)).toBeNull();
    expect(screen.queryByText(/Chỉ xem/)).toBeNull();
  });

  it('WA-01 có ô lọc chi nhánh với các chi nhánh của bác sĩ; chọn chi nhánh gọi lại với chiNhanhId, bác sĩ chọn được thu hẹp theo chi nhánh', async () => {
    await renderAdmin();
    await screen.findByRole('table');
    const select = screen.getByLabelText('Lọc theo chi nhánh');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Tất cả chi nhánh',
      'CLINIX Chi nhánh Quận 3',
      'CLINIX Chi nhánh Quận 7',
    ]);
    fireEvent.change(select, { target: { value: '2' } });
    await waitFor(() =>
      expect(
        callsTo('/admin/doctor-shifts').at(-1)!.searchParams.get('chiNhanhId'),
      ).toBe('2'),
    );
    const doctorSelect = screen.getByLabelText('Lọc theo bác sĩ');
    expect(
      within(doctorSelect).queryByRole('option', {
        name: 'ThS.BS. Nguyễn Minh Anh',
      }),
    ).toBeNull();
    expect(
      within(doctorSelect).getByRole('option', { name: 'BS. Lê Thảo Vy' }),
    ).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'all' } });
    await waitFor(() =>
      expect(
        callsTo('/admin/doctor-shifts').at(-1)!.searchParams.has('chiNhanhId'),
      ).toBe(false),
    );
  });

  it('WA-14 Toàn hệ thống không có banner và không gọi danh sách yêu cầu nghỉ', async () => {
    pendingResponse = () =>
      jsonResponse({ items: [], total: 3, page: 1, pageSize: 1 });
    await renderAdmin();
    await screen.findByRole('table');
    expect(screen.queryByText(/yêu cầu nghỉ chờ duyệt/)).toBeNull();
    expect(callsTo('/admin/leave-requests')).toHaveLength(0);
  });

  it('WA-01 ngăn kéo "Chi tiết ca" của Admin Toàn hệ thống ghi chi nhánh của ca', async () => {
    await renderAdmin();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Lê Thảo Vy, Ca chiều, Thứ 4, 14\/10\/2026, Làm việc/,
      }),
    );
    const drawer = await screen.findByRole('dialog', {
      name: 'BS. Lê Thảo Vy',
    });
    expect(drawer).toHaveTextContent('Chi nhánh: CLINIX Chi nhánh Quận 7');
    expect(
      within(drawer).getByRole('button', { name: /Quản lý lịch hẹn/ }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('bác sĩ ngoài phạm vi hoặc không có (?bacSiId=): Admin nhận 404 ⇒ "Không tìm thấy dữ liệu.", không có "Thử lại"', async () => {
    gridResponse = () =>
      jsonResponse({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404);
    await renderAdmin({ phamVi: 'ToanHeThong' }, '?bacSiId=999');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy dữ liệu.',
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(
      callsTo('/admin/doctor-shifts').at(-1)!.searchParams.get('bacSiId'),
    ).toBe('999');
  });
});

describe('lưới Admin Chi nhánh (F6)', () => {
  it('WA-01 chip chi nhánh cố định, không có ô lọc chi nhánh, không ghi chi nhánh ở từng bác sĩ, không gửi chiNhanhId', async () => {
    await renderAdmin(BRANCH_ADMIN);
    const table = await screen.findByRole('table');
    expect(
      screen.getByText('CLINIX Chi nhánh Quận 3', {
        selector: 'span.inline-flex',
      }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Lọc theo chi nhánh')).toBeNull();
    expect(
      within(table).getByText('ThS.BS. Nguyễn Minh Anh').closest('th'),
    ).not.toHaveTextContent('CLINIX Chi nhánh');
    expect(
      callsTo('/admin/doctor-shifts').every(
        (url) => !url.searchParams.has('chiNhanhId'),
      ),
    ).toBe(true);
    // Vẫn có nút "Phân công ca" (Figma 622:2)
    expect(screen.getByRole('button', { name: 'Phân công ca' })).toBeVisible();
  });

  it('WA-14 banner: "Có 1 yêu cầu nghỉ chờ duyệt trong phạm vi của bạn." + "Xem yêu cầu" (chưa dùng được tới F8); gọi đúng tham số', async () => {
    pendingResponse = () =>
      jsonResponse({ items: [], total: 1, page: 1, pageSize: 1 });
    await renderAdmin(BRANCH_ADMIN);
    const banner = (await screen.findByText(/yêu cầu nghỉ chờ duyệt/)).closest(
      'p',
    )!;
    expect(banner).toHaveTextContent(
      'Có 1 yêu cầu nghỉ chờ duyệt trong phạm vi của bạn.',
    );
    const action = within(banner).getByRole('button', { name: /Xem yêu cầu/ });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    const call = callsTo('/admin/leave-requests')[0];
    expect(call.searchParams.get('trangThai')).toBe('ChoDuyet');
    expect(call.searchParams.get('pageSize')).toBe('1');
  });

  it('WA-14 không có yêu cầu chờ (0) hoặc lỗi tải số đếm: không có banner, lưới vẫn dùng được', async () => {
    await renderAdmin(BRANCH_ADMIN);
    await screen.findByRole('table');
    expect(screen.queryByText(/yêu cầu nghỉ chờ duyệt/)).toBeNull();
  });

  it('WA-14 lỗi tải số đếm: không có banner', async () => {
    pendingResponse = () =>
      jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500);
    await renderAdmin(BRANCH_ADMIN);
    await screen.findByRole('table');
    expect(screen.queryByText(/yêu cầu nghỉ chờ duyệt/)).toBeNull();
  });

  it('ngăn kéo "Chi tiết ca" của Admin Chi nhánh không ghi chi nhánh', async () => {
    await renderAdmin(BRANCH_ADMIN);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Nguyễn Minh Anh, Ca sáng, Thứ 2, 12\/10\/2026, Làm việc/,
      }),
    );
    const drawer = await screen.findByRole('dialog', {
      name: 'ThS.BS. Nguyễn Minh Anh',
    });
    expect(drawer).not.toHaveTextContent('Chi nhánh:');
  });
});

describe('quyền truy cập (F6)', () => {
  it.each(['BenhNhan', 'LeTan', 'BacSi'] as const)(
    '%s mở /admin/lich-lam-viec-bac-si: 404, không thấy trang Admin',
    async (vaiTro) => {
      setAuthState({
        status: 'authenticated',
        user: { vaiTro, hoTen: `Họ tên ${vaiTro}`, daXacMinhEmail: true },
      });
      render(
        <RouterProvider
          router={createMemoryRouter(createAppRoutes(), {
            initialEntries: [ADMIN_SCHEDULE_PATH],
          })}
        />,
      );
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('heading', { name: 'Lịch làm việc bác sĩ' }),
      ).toBeNull();
      expect(callsTo('/admin/doctor-shifts')).toHaveLength(0);
    },
  );
});
