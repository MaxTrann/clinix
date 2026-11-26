import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { resetAuthForTest, restoreSession } from '../../../auth/auth-session';
import { AdminScopeGuard, type AdminMe } from '../../../admin';
import { createAppRoutes } from '../../../../router/routes';
import { ADMIN_RESCHEDULE_REQUESTS_PATH } from '../../../../shared/routes/booking-paths';
import { createFakeAuthApi } from '../../../../test/fake-auth-api';
import type {
  AdminLeaveItem,
  AffectedAppointments,
} from '../../api/admin-leave-api';
import type { ReceptionDoctor } from '../../api/reception-api';
import { jsonResponse } from '../../testing/fetch-routing';
import {
  ADMIN_APPROVALS_PATH,
  ADMIN_APPROVALS_SEGMENT,
  ADMIN_LEAVE_APPROVALS_PATH,
  ADMIN_LEAVE_APPROVALS_SEGMENT,
} from './approvals-paths';
import { createAdminApprovalsRoutes } from './approvals-routes';

// Dự án không dùng `@testing-library/user-event`: bộ giả nhỏ dưới đây đủ cho các thao tác của F8 (bấm, gõ nối thêm, xoá, phím Esc).
const userEvent = {
  setup: () => ({
    click: async (element: Element) => {
      fireEvent.click(element);
    },
    type: async (element: Element, text: string) => {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: input.value + text } });
    },
    clear: async (element: Element) => {
      fireEvent.change(element, { target: { value: '' } });
    },
    keyboard: async (keys: string) => {
      if (keys === '{Escape}') fireEvent.keyDown(document, { key: 'Escape' });
    },
  }),
};

// doctor F8: WA-07 (thẻ, lọc, phân trang, rỗng), WA-08 (chi tiết), WA-09 (hộp Từ chối), WA-13 (tab đổi lịch là liên kết; reschedule F5), WA-15 (hộp thoại: tên truy cập, focus, Esc).
// Bổ sung: lỗi 409/mạng khi Từ chối, Admin Chi nhánh, lỗi tải.
// doctor F9: WA-10 (hộp Xác nhận duyệt), WA-11 (kết quả duyệt), WA-12 (Xử lý lại), WA-15 (hộp Duyệt). WA-16 (F8 không có nút Duyệt) hết hiệu lực khi F9 thêm nút.
const Q3 = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' };
const Q7 = { chiNhanhId: '2', ten: 'CLINIX Chi nhánh Quận 7' };

function leave(overrides: Partial<AdminLeaveItem>): AdminLeaveItem {
  return {
    yeuCauNghiPhepId: '1',
    trangThai: 'ChoDuyet',
    hinhThuc: 'TheoCa',
    tuNgay: '2026-10-29',
    denNgay: '2026-10-29',
    ca: 'CaChieu',
    lyDo: 'Khám sức khoẻ định kỳ',
    thoiDiemTao: '2026-10-18T03:00:00.000Z',
    thoiDiemXuLy: null,
    bacSi: { bacSiId: '11', hoTen: 'ThS.BS. Nguyễn Minh Anh' },
    chuyenKhoa: { ten: 'Tim mạch' },
    chiNhanh: Q3,
    soLichHenBiAnhHuong: 0,
    ...overrides,
  };
}

// Hộp xác nhận Duyệt (Q32): 3 lịch, 2 đã đặt cọc, 2 bệnh nhân
const AFFECTED: AffectedAppointments = {
  tong: 3,
  soBenhNhan: 2,
  soCoCoc: 2,
  conNua: false,
  items: [
    {
      maLichHen: 'LH-0001',
      thoiGian: '2026-10-29T07:30:00.000Z',
      trangThai: 'DaXacNhan',
      nguoiKham: { hoTen: 'Trần Văn An' },
      tienCocSnapshot: '200000.00',
    },
    {
      maLichHen: 'LH-0002',
      thoiGian: '2026-10-29T08:00:00.000Z',
      trangThai: 'ChoThanhToan',
      nguoiKham: { hoTen: 'Lê Thị Bình' },
      tienCocSnapshot: '0.00',
    },
    {
      maLichHen: 'LH-0003',
      thoiGian: '2026-10-29T08:30:00.000Z',
      trangThai: 'DaXacNhan',
      nguoiKham: { hoTen: 'Trần Văn An' },
      tienCocSnapshot: '150000.00',
    },
  ],
};
const NO_AFFECTED: AffectedAppointments = {
  tong: 0,
  soBenhNhan: 0,
  soCoCoc: 0,
  conNua: false,
  items: [],
};
const DONE = { hoanTat: true, daHuy: 3, daHuyTruocDo: 0, khongHuyDuoc: [] };

const ITEMS: AdminLeaveItem[] = [
  leave({}),
  leave({
    yeuCauNghiPhepId: '2',
    hinhThuc: 'CaNgay',
    ca: null,
    tuNgay: '2026-10-26',
    denNgay: '2026-10-27',
  }),
];
const STATS = { choDuyet: 2, daDuyet: 0, tuChoi: 0, tong: 2 };
// UX7: yêu cầu "Theo ca" kéo dài nhiều ngày (một ca, năm ngày liên tiếp)
const THEO_CA_NHIEU_NGAY = leave({
  yeuCauNghiPhepId: '7',
  ca: 'CaSang',
  tuNgay: '2026-11-24',
  denNgay: '2026-11-28',
});
const DOCTORS: ReceptionDoctor[] = [
  {
    bacSiId: '11',
    hoTen: 'ThS.BS. Nguyễn Minh Anh',
    ngungHoatDong: false,
    chiNhanh: Q3,
    chuyenKhoa: { chuyenKhoaId: '5', ten: 'Tim mạch' },
  },
  {
    bacSiId: '12',
    hoTen: 'BS. Lê Thảo Vy',
    ngungHoatDong: false,
    chiNhanh: Q7,
    chuyenKhoa: { chuyenKhoaId: '6', ten: 'Nhi khoa' },
  },
];

const page = (items = ITEMS, stats = STATS, total = items.length) =>
  jsonResponse({ items, total, page: 1, pageSize: 10, thongKe: stats });

const fetchMock = vi.fn<typeof fetch>();
let api: ReturnType<typeof createFakeAuthApi>;
let scope: AdminMe;
let listResponse: () => Response;
let detailResponse: () => Response;
let rejectResponse: () => Response | Promise<Response>;
let approveResponse: () => Response | Promise<Response>;
let retryResponse: () => Response | Promise<Response>;

function callsTo(pathEnd: string, method = 'GET') {
  return fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? 'GET') === method)
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
  listResponse = () => page();
  detailResponse = () =>
    jsonResponse({
      ...ITEMS[0],
      lyDo: 'Việc gia đình đột xuất',
      lichHenBiAnhHuong: NO_AFFECTED,
    });
  approveResponse = () =>
    jsonResponse({
      yeuCauNghiPhepId: '1',
      trangThai: 'DaDuyet',
      thoiDiemXuLy: '2026-10-20T03:00:00.000Z',
      huyLichHen: DONE,
    });
  retryResponse = () =>
    jsonResponse({
      yeuCauNghiPhepId: '1',
      trangThai: 'DaDuyet',
      huyLichHen: DONE,
    });
  rejectResponse = () =>
    jsonResponse({ yeuCauNghiPhepId: '1', trangThai: 'TuChoi' });
  fetchMock.mockReset();
  fetchMock.mockImplementation((input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (url.pathname.endsWith('/admin/me'))
      return Promise.resolve(jsonResponse(scope));
    if (url.pathname.endsWith('/admin/doctor-shifts/doctors'))
      return Promise.resolve(
        jsonResponse({ items: DOCTORS, total: 2, page: 1, pageSize: 100 }),
      );
    if (url.pathname.endsWith('/reject') && method === 'POST')
      return Promise.resolve(rejectResponse());
    if (url.pathname.endsWith('/approve') && method === 'POST')
      return Promise.resolve(approveResponse());
    if (url.pathname.endsWith('/retry-cancellations') && method === 'POST')
      return Promise.resolve(retryResponse());
    if (/\/admin\/leave-requests\/\d+$/.test(url.pathname))
      return Promise.resolve(detailResponse());
    if (url.pathname.endsWith('/admin/leave-requests'))
      return Promise.resolve(listResponse());
    // reschedule F5: bấm tab "Yêu cầu đổi lịch" dựng trang của booking (router thật) nên trả danh sách rỗng đúng hình dạng
    if (url.pathname.endsWith('/admin/reschedule-requests'))
      return Promise.resolve(
        jsonResponse({ items: [], total: 0, page: 1, pageSize: 20 }),
      );
    if (/\/public\/(doctors|branches)$/.test(url.pathname))
      return Promise.resolve(
        jsonResponse({ items: [], total: 0, page: 1, pageSize: 100 }),
      );
    return api.fetch(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderPage(
  adminScope: AdminMe = { phamVi: 'ToanHeThong' },
  path = ADMIN_LEAVE_APPROVALS_PATH,
) {
  scope = adminScope;
  api.startSession();
  await restoreSession();
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const BRANCH_ADMIN: AdminMe = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '1', ten: Q3.ten },
};

describe('trang Duyệt yêu cầu - nghỉ phép (F8)', () => {
  it('WA-07 danh sách: tiêu đề, menu sáng, bốn thẻ thống kê, cột (có Lịch hẹn bị ảnh hưởng) và dòng đúng', async () => {
    await renderPage();
    const table = await screen.findByRole('table', {
      name: 'Yêu cầu nghỉ phép của bác sĩ',
    });
    expect(
      screen.getByRole('heading', { name: 'Duyệt yêu cầu' }),
    ).toBeVisible();
    const link = within(
      screen.getByRole('complementary', { name: 'Điều hướng Admin' }),
    ).getByRole('link', { name: 'Duyệt yêu cầu' });
    expect(link).toHaveAttribute('href', ADMIN_APPROVALS_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');

    const stats = screen.getByRole('list', {
      name: 'Thống kê yêu cầu nghỉ phép',
    });
    expect(within(stats).getAllByRole('listitem')).toHaveLength(4);
    expect(within(stats).getByText('Tổng yêu cầu')).toBeVisible();

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Bác sĩ',
      'Loại nghỉ',
      'Thời gian',
      'Lý do nghỉ',
      'Ngày gửi',
      'Lịch hẹn bị ảnh hưởng',
      'Trạng thái',
      'Thao tác',
    ]);
    expect(within(table).getByText('Ca chiều ngày 29/10/2026')).toBeVisible();
    expect(
      within(table).getByText('Cả ngày 26/10/2026 – 27/10/2026'),
    ).toBeVisible();
    expect(within(table).getAllByText('18/10/2026')).toHaveLength(2);
    expect(within(table).getAllByText('Chờ duyệt')).toHaveLength(2);
    expect(within(table).getAllByText('Tim mạch')).toHaveLength(2);
    expect(callsTo('/admin/leave-requests')[0].searchParams.get('page')).toBe(
      '1',
    );
  });

  it('DUX7-46 WA-07 (UX7) "Theo ca" nhiều ngày: cột Loại nghỉ vẫn "Theo ca", cột Thời gian in CẢ khoảng "Ca sáng 24/11/2026 – 28/11/2026" (không chỉ ngày đầu); một ngày giữ "Ca chiều ngày 29/10/2026"', async () => {
    listResponse = () => page([THEO_CA_NHIEU_NGAY, leave({})]);
    await renderPage();
    const table = await screen.findByRole('table', {
      name: 'Yêu cầu nghỉ phép của bác sĩ',
    });
    expect(
      within(table).getByText('Ca sáng 24/11/2026 – 28/11/2026'),
    ).toBeVisible();
    expect(within(table).queryByText('Ca sáng ngày 24/11/2026')).toBeNull();
    expect(within(table).getByText('Ca chiều ngày 29/10/2026')).toBeVisible();
    expect(within(table).getAllByText('Theo ca')).toHaveLength(2);
  });

  it('WA-07 /admin/duyet-yeu-cau chuyển tới tab nghỉ phép (Q36)', async () => {
    const router = await renderPage(
      { phamVi: 'ToanHeThong' },
      ADMIN_APPROVALS_PATH,
    );
    await screen.findByRole('table');
    expect(router.state.location.pathname).toBe(ADMIN_LEAVE_APPROVALS_PATH);
  });

  it('WA-07 lọc: trạng thái, ngày gửi, chi nhánh gửi đúng tham số và về trang 1; tìm kiếm < 2 ký tự không gửi, ≥ 2 ký tự gửi sau khi ngừng gõ', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Trạng thái'), {
      target: { value: 'TuChoi' },
    });
    await waitFor(() =>
      expect(
        callsTo('/admin/leave-requests').at(-1)!.searchParams.get('trangThai'),
      ).toBe('TuChoi'),
    );
    fireEvent.change(screen.getByLabelText('Từ ngày gửi'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.change(screen.getByLabelText('Đến ngày gửi'), {
      target: { value: '2026-10-31' },
    });
    fireEvent.change(screen.getByLabelText('Chi nhánh'), {
      target: { value: '2' },
    });
    await waitFor(() => {
      const params = callsTo('/admin/leave-requests').at(-1)!.searchParams;
      expect(params.get('tuNgayGui')).toBe('2026-10-01');
      expect(params.get('denNgayGui')).toBe('2026-10-31');
      expect(params.get('chiNhanhId')).toBe('2');
      expect(params.get('page')).toBe('1');
    });

    // Ô chi nhánh liệt kê chi nhánh của các bác sĩ
    expect(
      within(screen.getByLabelText('Chi nhánh'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Tất cả chi nhánh', Q3.ten, Q7.ten]);

    await user.type(screen.getByLabelText('Tìm kiếm'), 'a');
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(
      callsTo('/admin/leave-requests').every(
        (url) => url.searchParams.get('q') === null,
      ),
    ).toBe(true);
    await user.type(screen.getByLabelText('Tìm kiếm'), 'n');
    await waitFor(() =>
      expect(
        callsTo('/admin/leave-requests').at(-1)!.searchParams.get('q'),
      ).toBe('an'),
    );
  });

  it('WA-07 khoảng ngày ngược: báo lỗi dưới ô và không gửi "đến ngày"', async () => {
    await renderPage();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Từ ngày gửi'), {
      target: { value: '2026-10-20' },
    });
    fireEvent.change(screen.getByLabelText('Đến ngày gửi'), {
      target: { value: '2026-10-10' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'không được trước',
    );
    expect(
      callsTo('/admin/leave-requests').every(
        (url) => url.searchParams.get('denNgayGui') === null,
      ),
    ).toBe(true);
  });

  it('WA-07 phân trang: tổng 25 yêu cầu ⇒ 3 trang, bấm "Trang sau" gọi page=2', async () => {
    listResponse = () => page(ITEMS, { ...STATS, tong: 25 }, 25);
    await renderPage();
    await screen.findByRole('table');
    expect(screen.getByText('Trang 1 / 3')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() =>
      expect(
        callsTo('/admin/leave-requests').at(-1)!.searchParams.get('page'),
      ).toBe('2'),
    );
  });

  it('WA-07 rỗng: "Không có yêu cầu nào" (Figma 517:2), thẻ vẫn hiện và bằng 0', async () => {
    listResponse = () =>
      page([], { choDuyet: 0, daDuyet: 0, tuChoi: 0, tong: 0 });
    await renderPage();
    expect(await screen.findByText('Không có yêu cầu nào')).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      within(
        screen.getByRole('list', { name: 'Thống kê yêu cầu nghỉ phép' }),
      ).getAllByText('0'),
    ).toHaveLength(4);
  });

  it('WA-07 lỗi tải: báo lỗi và "Thử lại" gọi lại; mất mạng báo đúng câu', async () => {
    listResponse = () =>
      jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500);
    await renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra');
    listResponse = () => page();
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('table')).toBeVisible();
  });

  it('WA-07 Admin Chi nhánh: chip chi nhánh cố định, không có ô chọn chi nhánh, không gửi chiNhanhId (Figma 623:2)', async () => {
    await renderPage(BRANCH_ADMIN);
    await screen.findByRole('table');
    expect(screen.queryByLabelText('Chi nhánh')).toBeNull();
    // Chip ở khối lọc (ngoài bảng và thanh bên)
    expect(screen.getAllByText(Q3.ten).length).toBeGreaterThan(0);
    expect(
      callsTo('/admin/leave-requests').every(
        (url) => url.searchParams.get('chiNhanhId') === null,
      ),
    ).toBe(true);
  });

  it('WXD-14 WA-13 (reschedule F5) tab "Yêu cầu đổi lịch" là liên kết: bấm mở trang đổi lịch trong khung host và tab đó sáng; bấm tab nghỉ phép thì quay lại', async () => {
    const router = await renderPage();
    await screen.findByRole('table');
    const tabs = screen.getByRole('navigation', { name: 'Loại yêu cầu' });
    const rescheduleTab = within(tabs).getByRole('link', {
      name: 'Yêu cầu đổi lịch',
    });
    const leaveTab = within(tabs).getByRole('link', {
      name: 'Yêu cầu nghỉ phép',
    });
    expect(rescheduleTab).toHaveAttribute(
      'href',
      ADMIN_RESCHEDULE_REQUESTS_PATH,
    );
    expect(rescheduleTab).not.toHaveAttribute('aria-disabled');
    expect(rescheduleTab).not.toHaveAttribute('aria-current');
    expect(leaveTab).toHaveAttribute('aria-current', 'page');

    fireEvent.click(rescheduleTab);
    expect(
      await screen.findByText('Không có yêu cầu nào đang chờ duyệt.'),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(ADMIN_RESCHEDULE_REQUESTS_PATH);
    expect(rescheduleTab).toHaveAttribute('aria-current', 'page');
    expect(leaveTab).not.toHaveAttribute('aria-current');

    fireEvent.click(leaveTab);
    expect(await screen.findByRole('table')).toBeVisible();
    expect(router.state.location.pathname).toBe(ADMIN_LEAVE_APPROVALS_PATH);
    expect(leaveTab).toHaveAttribute('aria-current', 'page');
    expect(rescheduleTab).not.toHaveAttribute('aria-current');
  });

  it('WXD-136 `nav` "Loại yêu cầu" có đúng hai liên kết, không nút nào', async () => {
    await renderPage();
    await screen.findByRole('table');
    const tabs = screen.getByRole('navigation', { name: 'Loại yêu cầu' });
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Yêu cầu nghỉ phép', 'Yêu cầu đổi lịch']);
    expect(within(tabs).queryByRole('button')).toBeNull();
  });
});

// reschedule F5: trang host "Duyệt yêu cầu" nhận route con của module khác qua tham số (doctor không import booking, WHT-10)
describe('route "Duyệt yêu cầu" nhận route con từ ngoài', () => {
  const hostOf = (routes: RouteObject[]) => routes[0].children![0];
  const childrenOf = (routes: RouteObject[]) =>
    hostOf(routes).children!.map((route) =>
      route.index ? 'index' : route.path,
    );

  it('WXD-137 không truyền gì thì trang host có đúng hai route con (mặc định và nghỉ phép); route truyền vào nối SAU, vẫn dưới `AdminScopeGuard policy="Any"`', () => {
    expect(childrenOf(createAdminApprovalsRoutes())).toEqual([
      'index',
      ADMIN_LEAVE_APPROVALS_SEGMENT,
    ]);
    const routes = createAdminApprovalsRoutes([{ path: 'them' }]);
    expect(childrenOf(routes)).toEqual([
      'index',
      ADMIN_LEAVE_APPROVALS_SEGMENT,
      'them',
    ]);
    expect(hostOf(routes).path).toBe(ADMIN_APPROVALS_SEGMENT);
    const guard = routes[0].element as ReactElement<{ policy: string }>;
    expect(guard.type).toBe(AdminScopeGuard);
    expect(guard.props.policy).toBe('Any');
  });
});

describe('chi tiết yêu cầu (F8)', () => {
  it('DUX7-48 WA-08 (UX7) ngăn chi tiết "Theo ca" nhiều ngày: Loại nghỉ "Theo ca" và Thời gian "Ca sáng 24/11/2026 – 28/11/2026"', async () => {
    listResponse = () => page([THEO_CA_NHIEU_NGAY]);
    const user = userEvent.setup();
    await renderPage();
    const table = await screen.findByRole('table');
    await user.click(
      within(table).getAllByRole('button', {
        name: 'ThS.BS. Nguyễn Minh Anh',
      })[0],
    );
    const drawer = await screen.findByRole('dialog', {
      name: 'ThS.BS. Nguyễn Minh Anh',
    });
    expect(within(drawer).getByText('Theo ca')).toBeVisible();
    expect(
      within(drawer).getByText('Ca sáng 24/11/2026 – 28/11/2026'),
    ).toBeVisible();
  });

  it('WA-08 bấm tên bác sĩ mở ngăn kéo: tên, chuyên khoa, chi nhánh, loại, thời gian, lý do (từ GET /:id), ngày gửi; Esc đóng và trả focus', async () => {
    const user = userEvent.setup();
    await renderPage();
    const table = await screen.findByRole('table');
    const opener = within(table).getAllByRole('button', {
      name: 'ThS.BS. Nguyễn Minh Anh',
    })[0];
    await user.click(opener);
    const drawer = await screen.findByRole('dialog', {
      name: 'ThS.BS. Nguyễn Minh Anh',
    });
    expect(
      await within(drawer).findByText('Việc gia đình đột xuất'),
    ).toBeVisible();
    expect(within(drawer).getByText('Theo ca')).toBeVisible();
    expect(within(drawer).getByText('Ca chiều ngày 29/10/2026')).toBeVisible();
    expect(within(drawer).getByText('18/10/2026')).toBeVisible();
    expect(within(drawer).getByText(Q3.ten)).toBeVisible();
    expect(callsTo('/admin/leave-requests/1')).toHaveLength(1);
    // Mục "Lịch hẹn bị ảnh hưởng" lấy số thật từ server (B17), ở đây là 0
    expect(within(drawer).getByText('Lịch hẹn bị ảnh hưởng (0)')).toBeVisible();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('WA-08 chi tiết lỗi tải: vẫn thấy phần đầu, có "Thử lại"', async () => {
    const user = userEvent.setup();
    detailResponse = () =>
      jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500);
    await renderPage();
    const table = await screen.findByRole('table');
    await user.click(
      within(table).getAllByRole('button', {
        name: 'ThS.BS. Nguyễn Minh Anh',
      })[0],
    );
    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByRole('button', { name: 'Thử lại' }),
    ).toBeVisible();
    expect(within(drawer).getByText('Theo ca')).toBeVisible();
  });

  it('WA-08 yêu cầu đã xử lý: chi tiết không có nút Từ chối, dòng không có nút thao tác', async () => {
    listResponse = () =>
      page([
        leave({
          trangThai: 'DaDuyet',
          thoiDiemXuLy: '2026-10-19T03:00:00.000Z',
        }),
      ]);
    const user = userEvent.setup();
    await renderPage();
    const table = await screen.findByRole('table');
    expect(
      within(table).queryByRole('button', { name: /Từ chối yêu cầu/ }),
    ).toBeNull();
    expect(within(table).queryByRole('button', { name: /^Duyệt/ })).toBeNull();
    expect(within(table).getByText('Đã xử lý')).toBeVisible();
    await user.click(
      within(table).getByRole('button', { name: 'ThS.BS. Nguyễn Minh Anh' }),
    );
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Đã duyệt')).toBeVisible();
    expect(
      within(drawer).queryByRole('button', { name: 'Từ chối' }),
    ).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Duyệt' })).toBeNull();
  });
});

describe('hộp Từ chối (F8)', () => {
  async function openReject() {
    const user = userEvent.setup();
    await renderPage();
    const table = await screen.findByRole('table');
    await user.click(
      within(table).getAllByRole('button', {
        name: /Từ chối yêu cầu của ThS.BS. Nguyễn Minh Anh/,
      })[0],
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Từ chối yêu cầu nghỉ phép',
    });
    return { user, dialog };
  }

  it('WA-09/WA-15 hộp có tên truy cập, focus ở ô lý do; "Từ chối" vô hiệu khi lý do trống hoặc chỉ khoảng trắng', async () => {
    const { user, dialog } = await openReject();
    const reason = within(dialog).getByLabelText(/Lý do từ chối/);
    expect(reason).toHaveFocus();
    const submit = within(dialog).getByRole('button', { name: 'Từ chối' });
    expect(submit).toBeDisabled();
    await user.type(reason, '   ');
    expect(submit).toBeDisabled();
    await user.type(reason, 'Thiếu bác sĩ trực');
    expect(submit).toBeEnabled();
  });

  it('WA-09 lý do quá 255 ký tự hoặc có xuống dòng: báo lỗi và vô hiệu nút; đúng 255 ký tự thì được', async () => {
    const { user, dialog } = await openReject();
    const reason = within(dialog).getByLabelText(/Lý do từ chối/);
    const submit = within(dialog).getByRole('button', { name: 'Từ chối' });
    fireEvent.change(reason, { target: { value: 'a'.repeat(256) } });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByText(/tối đa 255/)).toBeVisible();
    fireEvent.change(reason, { target: { value: 'a'.repeat(255) } });
    expect(submit).toBeEnabled();
    fireEvent.change(reason, { target: { value: 'dòng 1\ndòng 2' } });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByText(/ký tự điều khiển/)).toBeVisible();
    await user.clear(reason);
    expect(within(dialog).queryByText(/ký tự điều khiển/)).toBeNull();
  });

  it('WA-09 Từ chối thành công: gửi POST đúng thân (lý do đã cắt khoảng trắng), đóng hộp, báo thành công, tải lại danh sách', async () => {
    const { user, dialog } = await openReject();
    await user.type(
      within(dialog).getByLabelText(/Lý do từ chối/),
      '  Thiếu bác sĩ trực  ',
    );
    const listCallsBefore = callsTo('/admin/leave-requests').length;
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/admin/leave-requests/1/reject'),
    )!;
    expect(call[1]?.method).toBe('POST');
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      lyDo: 'Thiếu bác sĩ trực',
    });
    expect(
      await screen.findByText('Đã từ chối yêu cầu nghỉ phép.'),
    ).toBeVisible();
    await waitFor(() =>
      expect(callsTo('/admin/leave-requests').length).toBeGreaterThan(
        listCallsBefore,
      ),
    );
  });

  it('WA-09 bấm Từ chối hai lần liên tiếp chỉ gửi MỘT yêu cầu', async () => {
    let release: (response: Response) => void = () => undefined;
    rejectResponse = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    const { user, dialog } = await openReject();
    await user.type(within(dialog).getByLabelText(/Lý do từ chối/), 'Lý do');
    const submit = within(dialog).getByRole('button', { name: 'Từ chối' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(callsTo('/reject', 'POST')).toHaveLength(1);
    release(jsonResponse({ yeuCauNghiPhepId: '1', trangThai: 'TuChoi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('WA-09 409 YEU_CAU_DA_XU_LY (Admin khác xử lý trước): báo lỗi, không cho gửi lại, tải lại danh sách, nút đổi thành "Đóng"', async () => {
    rejectResponse = () =>
      jsonResponse({ maLoi: 'YEU_CAU_DA_XU_LY', thongBao: 'x' }, 409);
    const { user, dialog } = await openReject();
    await user.type(within(dialog).getByLabelText(/Lý do từ chối/), 'Lý do');
    const listCallsBefore = callsTo('/admin/leave-requests').length;
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'đã được xử lý',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Từ chối' }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(callsTo('/admin/leave-requests').length).toBeGreaterThan(
        listCallsBefore,
      ),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('WA-09 400 LY_DO_TU_CHOI_KHONG_HOP_LE và 404 từ server: hiện câu theo mã, không in thongBao', async () => {
    rejectResponse = () =>
      jsonResponse(
        { maLoi: 'LY_DO_TU_CHOI_KHONG_HOP_LE', thongBao: 'RAW' },
        400,
      );
    const { user, dialog } = await openReject();
    await user.type(within(dialog).getByLabelText(/Lý do từ chối/), 'Lý do');
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Vui lòng nhập lý do từ chối');
    expect(alert).not.toHaveTextContent('RAW');
    // Còn sửa và gửi lại được
    expect(
      within(dialog).getByRole('button', { name: 'Từ chối' }),
    ).toBeEnabled();
  });

  it('WA-09 mất mạng khi gửi: báo "chưa rõ", giữ nguyên lý do, không tự gửi lại', async () => {
    rejectResponse = () => {
      throw new TypeError('Failed to fetch');
    };
    const { user, dialog } = await openReject();
    const reason = within(dialog).getByLabelText(/Lý do từ chối/);
    await user.type(reason, 'Giữ lại');
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Chưa rõ yêu cầu đã được từ chối chưa',
    );
    expect(reason).toHaveValue('Giữ lại');
    expect(callsTo('/reject', 'POST')).toHaveLength(1);
  });

  it('WA-15 Esc và nút Hủy đóng hộp mà không gọi API; focus về nút đã mở', async () => {
    const { user, dialog } = await openReject();
    const opener = screen.getAllByRole('button', {
      name: /Từ chối yêu cầu của/,
      hidden: true,
    })[0];
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(callsTo('/reject', 'POST')).toHaveLength(0);
    expect(opener).toHaveFocus();
    expect(dialog).not.toBeVisible();
  });

  it('WA-09 mở từ ngăn kéo: ngăn kéo đóng, hộp Từ chối mở cho đúng yêu cầu', async () => {
    const user = userEvent.setup();
    await renderPage();
    const table = await screen.findByRole('table');
    await user.click(
      within(table).getAllByRole('button', {
        name: 'ThS.BS. Nguyễn Minh Anh',
      })[0],
    );
    const drawer = await screen.findByRole('dialog', {
      name: 'ThS.BS. Nguyễn Minh Anh',
    });
    await user.click(within(drawer).getByRole('button', { name: 'Từ chối' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Từ chối yêu cầu nghỉ phép',
    });
    expect(
      screen.queryByRole('dialog', { name: 'ThS.BS. Nguyễn Minh Anh' }),
    ).toBeNull();
    await user.type(within(dialog).getByLabelText(/Lý do từ chối/), 'Lý do');
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() =>
      expect(callsTo('/admin/leave-requests/1/reject', 'POST')).toHaveLength(1),
    );
  });
});

describe('Duyệt yêu cầu nghỉ (F9)', () => {
  const approveDetail = (lichHenBiAnhHuong = AFFECTED) =>
    jsonResponse({
      ...ITEMS[0],
      soLichHenBiAnhHuong: lichHenBiAnhHuong.tong,
      lyDo: 'Việc gia đình đột xuất',
      lichHenBiAnhHuong,
    });
  const incomplete = (daHuy: number) =>
    jsonResponse({
      yeuCauNghiPhepId: '1',
      trangThai: 'DaDuyet',
      thoiDiemXuLy: '2026-10-20T03:00:00.000Z',
      huyLichHen: { ...DONE, hoanTat: false, daHuy },
    });

  beforeEach(() => {
    detailResponse = () => approveDetail();
  });

  // Mở hộp rồi chờ số lịch tải xong (nút "Xác nhận duyệt" bật)
  async function openApprove() {
    const user = userEvent.setup();
    await renderPage();
    const table = await screen.findByRole('table');
    await user.click(
      within(table).getAllByRole('button', {
        name: /Duyệt yêu cầu của ThS.BS. Nguyễn Minh Anh/,
      })[0],
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Xác nhận duyệt nghỉ phép',
    });
    const confirm = within(dialog).getByRole('button', {
      name: 'Xác nhận duyệt',
    });
    return { user, dialog, confirm };
  }

  it('DUX7-47 WA-10 (UX7) hộp Xác nhận duyệt "Theo ca" nhiều ngày nêu CẢ khoảng ngày và ca ("Ca sáng 24/11/2026 – 28/11/2026"), không chỉ ngày đầu', async () => {
    listResponse = () => page([THEO_CA_NHIEU_NGAY]);
    const { dialog } = await openApprove();
    expect(
      within(dialog).getByText('Ca sáng 24/11/2026 – 28/11/2026'),
    ).toBeVisible();
    expect(within(dialog).queryByText(/ngày 24\/11\/2026/)).toBeNull();
  });

  it('WA-10 hộp Xác nhận duyệt: focus ở "Hủy", nêu bác sĩ, thời gian, số lịch huỷ, số lịch hoàn cọc 100%, số bệnh nhân (Q32)', async () => {
    const { dialog, confirm } = await openApprove();
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus();
    expect(within(dialog).getByText('ThS.BS. Nguyễn Minh Anh')).toBeVisible();
    expect(within(dialog).getByText('Ca chiều ngày 29/10/2026')).toBeVisible();
    const value = (label: string) =>
      within(dialog).getByText(label).nextElementSibling;
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(value('Lịch hẹn sẽ bị hủy')).toHaveTextContent('3 lịch');
    expect(value('Lịch đã đặt cọc (hoàn 100% vào ví)')).toHaveTextContent(
      '2 lịch',
    );
    expect(value('Bệnh nhân nhận thông báo')).toHaveTextContent('2 bệnh nhân');
    expect(callsTo('/approve', 'POST')).toHaveLength(0);
  });

  it('WA-10 chưa tải được số lịch hẹn thì KHÔNG cho duyệt; "Thử lại" tải lại rồi mới bật nút', async () => {
    let fail = true;
    detailResponse = () =>
      fail
        ? jsonResponse({ maLoi: 'LOI_MAY_CHU', thongBao: 'x' }, 500)
        : approveDetail();
    const { user, dialog, confirm } = await openApprove();
    const retry = await within(dialog).findByRole('button', {
      name: /Thử lại/,
    });
    expect(confirm).toBeDisabled();
    fail = false;
    await user.click(retry);
    await waitFor(() => expect(confirm).toBeEnabled());
  });

  it('WA-11 duyệt thành công: POST không thân, đóng hộp, banner xanh "Đã hủy 3 lịch hẹn", tải lại danh sách', async () => {
    const { user, confirm } = await openApprove();
    await waitFor(() => expect(confirm).toBeEnabled());
    const listCallsBefore = callsTo('/admin/leave-requests').length;
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/admin/leave-requests/1/approve'),
    )!;
    expect(call[1]?.method).toBe('POST');
    expect(call[1]?.body).toBeUndefined();
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Đã duyệt nghỉ phép. Đã hủy 3 lịch hẹn.');
    expect(
      within(banner).queryByRole('button', { name: 'Xử lý lại' }),
    ).toBeNull();
    await waitFor(() =>
      expect(callsTo('/admin/leave-requests').length).toBeGreaterThan(
        listCallsBefore,
      ),
    );
  });

  it('WA-11 bấm Xác nhận duyệt hai lần liên tiếp chỉ gửi MỘT yêu cầu', async () => {
    let release: (response: Response) => void = () => undefined;
    approveResponse = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    const { user, confirm } = await openApprove();
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await user.click(confirm);
    expect(callsTo('/approve', 'POST')).toHaveLength(1);
    release(
      jsonResponse({
        yeuCauNghiPhepId: '1',
        trangThai: 'DaDuyet',
        huyLichHen: DONE,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('WA-11 có lịch không hủy được: banner vàng nêu mã lịch, KHÔNG có "Xử lý lại" (chạy lại cũng không đổi)', async () => {
    approveResponse = () =>
      jsonResponse({
        yeuCauNghiPhepId: '1',
        trangThai: 'DaDuyet',
        thoiDiemXuLy: '2026-10-20T03:00:00.000Z',
        huyLichHen: {
          ...DONE,
          daHuy: 2,
          khongHuyDuoc: [{ maLichHen: 'LH-0003', trangThai: 'DaTiepDon' }],
        },
      });
    const { user, confirm } = await openApprove();
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Đã hủy 2 lịch hẹn.');
    expect(banner).toHaveTextContent('1 lịch không hủy được (LH-0003)');
    expect(
      within(banner).queryByRole('button', { name: 'Xử lý lại' }),
    ).toBeNull();
  });

  it('WA-12 huỷ dang dở (hoanTat=false): banner vàng có "Xử lý lại"; bấm gọi retry-cancellations, banner đổi sang kết quả mới', async () => {
    approveResponse = () => incomplete(1);
    const { user, confirm } = await openApprove();
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('chưa xong');
    await user.click(within(banner).getByRole('button', { name: 'Xử lý lại' }));
    await waitFor(() =>
      expect(callsTo('/retry-cancellations', 'POST')).toHaveLength(1),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã hủy 3 lịch hẹn.',
    );
  });

  it('WA-12 Xử lý lại lỗi mạng: giữ banner, báo lỗi, cho thử lại', async () => {
    approveResponse = () => incomplete(0);
    retryResponse = () => {
      throw new TypeError('Failed to fetch');
    };
    const { user, confirm } = await openApprove();
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    const banner = await screen.findByRole('alert');
    await user.click(within(banner).getByRole('button', { name: 'Xử lý lại' }));
    expect(await screen.findByText(/Không có kết nối mạng/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Xử lý lại' })).toBeEnabled();
  });

  it('WA-11 409 YEU_CAU_DA_XU_LY (Admin khác xử lý trước): báo lỗi theo mã, không cho gửi lại, tải lại danh sách', async () => {
    approveResponse = () =>
      jsonResponse(
        { maLoi: 'YEU_CAU_DA_XU_LY', thongBao: 'không in câu này' },
        409,
      );
    const { user, dialog, confirm } = await openApprove();
    await waitFor(() => expect(confirm).toBeEnabled());
    const listCallsBefore = callsTo('/admin/leave-requests').length;
    await user.click(confirm);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'đã được xử lý trước đó',
    );
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeVisible();
    expect(within(dialog).queryByText('không in câu này')).toBeNull();
    await waitFor(() =>
      expect(callsTo('/admin/leave-requests').length).toBeGreaterThan(
        listCallsBefore,
      ),
    );
  });

  it('WA-11 409 YEU_CAU_NGHI_DA_QUA_HAN: báo "chỉ có thể từ chối"', async () => {
    approveResponse = () =>
      jsonResponse({ maLoi: 'YEU_CAU_NGHI_DA_QUA_HAN', thongBao: 'x' }, 409);
    const { user, dialog, confirm } = await openApprove();
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'chỉ có thể từ chối',
    );
  });

  it('WA-11 mất mạng khi duyệt: báo "chưa rõ", không tự gửi lại', async () => {
    approveResponse = () => {
      throw new TypeError('Failed to fetch');
    };
    const { user, dialog, confirm } = await openApprove();
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Chưa rõ yêu cầu đã được duyệt chưa',
    );
    expect(callsTo('/approve', 'POST')).toHaveLength(1);
  });

  it('WA-15 Esc đóng hộp Duyệt mà không gọi approve; focus về nút Duyệt đã mở', async () => {
    const { user } = await openApprove();
    const opener = screen.getAllByRole('button', {
      name: /Duyệt yêu cầu của/,
      hidden: true,
    })[0];
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(callsTo('/approve', 'POST')).toHaveLength(0);
    expect(opener).toHaveFocus();
  });

  it('WA-10 ngăn kéo yêu cầu chờ duyệt: liệt kê lịch bị ảnh hưởng (mã, giờ, tiền cọc) và nút Duyệt mở hộp xác nhận', async () => {
    const user = userEvent.setup();
    await renderPage();
    const table = await screen.findByRole('table');
    await user.click(
      within(table).getAllByRole('button', {
        name: 'ThS.BS. Nguyễn Minh Anh',
      })[0],
    );
    const drawer = await screen.findByRole('dialog', {
      name: 'ThS.BS. Nguyễn Minh Anh',
    });
    expect(await within(drawer).findByText('LH-0001')).toBeVisible();
    expect(within(drawer).getByText('Lịch hẹn bị ảnh hưởng (3)')).toBeVisible();
    expect(
      within(drawer).getByText(/14:30 29\/10\/2026 · Cọc: 200\.000 ₫/),
    ).toBeVisible();
    expect(within(drawer).getByText(/Cọc: —/)).toBeVisible();
    await user.click(within(drawer).getByRole('button', { name: 'Duyệt' }));
    expect(
      await screen.findByRole('dialog', { name: 'Xác nhận duyệt nghỉ phép' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('dialog', { name: 'ThS.BS. Nguyễn Minh Anh' }),
    ).toBeNull();
  });

  it('WA-12 ngăn kéo yêu cầu đã duyệt còn lịch chưa huỷ có "Xử lý lại"', async () => {
    listResponse = () =>
      page([
        leave({
          trangThai: 'DaDuyet',
          thoiDiemXuLy: '2026-10-19T03:00:00.000Z',
          soLichHenBiAnhHuong: 3,
        }),
      ]);
    detailResponse = () =>
      jsonResponse({
        ...ITEMS[0],
        trangThai: 'DaDuyet',
        lyDo: 'x',
        lichHenBiAnhHuong: AFFECTED,
      });
    const user = userEvent.setup();
    await renderPage();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('3 lịch')).toBeVisible();
    await user.click(
      within(table).getByRole('button', { name: 'ThS.BS. Nguyễn Minh Anh' }),
    );
    const drawer = await screen.findByRole('dialog');
    await user.click(
      await within(drawer).findByRole('button', { name: 'Xử lý lại' }),
    );
    await waitFor(() =>
      expect(callsTo('/retry-cancellations', 'POST')).toHaveLength(1),
    );
  });
});
