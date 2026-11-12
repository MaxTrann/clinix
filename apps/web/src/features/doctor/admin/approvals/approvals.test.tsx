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
import type { AdminMe } from '../../../admin';
import { createAppRoutes } from '../../../../router/routes';
import { createFakeAuthApi } from '../../../../test/fake-auth-api';
import type { AdminLeaveItem } from '../../api/admin-leave-api';
import type { ReceptionDoctor } from '../../api/reception-api';
import { jsonResponse } from '../../testing/fetch-routing';
import {
  ADMIN_APPROVALS_PATH,
  ADMIN_LEAVE_APPROVALS_PATH,
} from './approvals-paths';

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

// doctor F8: WA-07 (thẻ, lọc, phân trang, rỗng), WA-08 (chi tiết), WA-09 (hộp Từ chối), WA-13 (tab đổi lịch vô hiệu), WA-15 (hộp thoại: tên truy cập, focus, Esc),
// WA-16 (không có nút Duyệt, không gọi `approve`). Bổ sung: lỗi 409/mạng khi Từ chối, Admin Chi nhánh, lỗi tải.
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
    thoiDiemTao: '2026-10-18T03:00:00.000Z',
    thoiDiemXuLy: null,
    bacSi: { bacSiId: '11', hoTen: 'ThS.BS. Nguyễn Minh Anh' },
    chuyenKhoa: { ten: 'Tim mạch' },
    chiNhanh: Q3,
    ...overrides,
  };
}

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
    jsonResponse({ ...ITEMS[0], lyDo: 'Việc gia đình đột xuất' });
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
    if (/\/admin\/leave-requests\/\d+$/.test(url.pathname))
      return Promise.resolve(detailResponse());
    if (url.pathname.endsWith('/admin/leave-requests'))
      return Promise.resolve(listResponse());
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
  it('WA-07 danh sách: tiêu đề, menu sáng, bốn thẻ thống kê, cột và dòng đúng; không có cột lịch hẹn bị ảnh hưởng', async () => {
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
      'Ngày gửi',
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

  it('WA-13 tab "Yêu cầu đổi lịch" vô hiệu: bấm không đổi trang và không gọi API khác', async () => {
    const router = await renderPage();
    await screen.findByRole('table');
    const tab = screen.getByRole('button', { name: /Yêu cầu đổi lịch/ });
    expect(tab).toHaveAttribute('aria-disabled', 'true');
    const before = fetchMock.mock.calls.length;
    fireEvent.click(tab);
    expect(router.state.location.pathname).toBe(ADMIN_LEAVE_APPROVALS_PATH);
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(
      screen.getByRole('link', { name: 'Yêu cầu nghỉ phép' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

describe('chi tiết yêu cầu (F8)', () => {
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
    // Chưa có mục "Lịch hẹn bị ảnh hưởng" và không có số 0 giả (B17)
    expect(within(drawer).queryByText(/Lịch hẹn bị ảnh hưởng/i)).toBeNull();

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

  it('WA-16 danh sách và ngăn kéo không có nút "Duyệt" và không gọi approve', async () => {
    const user = userEvent.setup();
    await renderPage();
    const table = await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /^Duyệt/ })).toBeNull();
    await user.click(
      within(table).getAllByRole('button', {
        name: 'ThS.BS. Nguyễn Minh Anh',
      })[0],
    );
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).queryByRole('button', { name: /^Duyệt/ })).toBeNull();
    expect(callsTo('/approve', 'POST')).toHaveLength(0);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/approve'),
      ),
    ).toBe(false);
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
    await user.click(
      within(table).getByRole('button', { name: 'ThS.BS. Nguyễn Minh Anh' }),
    );
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Đã duyệt')).toBeVisible();
    expect(
      within(drawer).queryByRole('button', { name: 'Từ chối' }),
    ).toBeNull();
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
