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
import { createAppRoutes } from '../../../../router/routes';
import { createFakeAuthApi } from '../../../../test/fake-auth-api';
import type { AdminLeaveItem } from '../../api/admin-leave-api';
import type { ReceptionDoctor } from '../../api/reception-api';
import { jsonResponse } from '../../testing/fetch-routing';
import { ADMIN_LEAVE_APPROVALS_PATH } from './approvals-paths';

// doctor UX2 (G14, G15): trang Duyệt yêu cầu có cột "Lý do nghỉ" (cắt ở web) và badge chuyên khoa cạnh tên bác sĩ. DUX2-30 đến DUX2-38; phủ WA-07 (danh sách) và WA-08 (chi tiết).
// App thật qua `createAppRoutes()` với `fetch` giả theo hợp đồng B13; mọi dữ liệu là chữ GIẢ. Phần còn lại của trang (lọc, phân trang, Từ chối, Duyệt) do approvals.test.tsx phủ.
const Q3 = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' };
const NAME = 'ThS.BS. Nguyễn Minh Anh';

// Lý do dài 150+ ký tự (cắt), đúng 80 (không cắt), ngắn, và có HTML
const LONG_REASON =
  'Tôi cần nghỉ để đưa người nhà đi khám và làm thủ tục nhập viện tại bệnh viện tuyến trên, dự kiến phải ở lại theo dõi vài ngày liền nên xin được nghỉ cả ngày.';
const LONG_PREVIEW = `${LONG_REASON.slice(0, 80).trimEnd()}…`;
const SHORT_REASON = 'Việc gia đình đột xuất';
const EXACT_80_REASON = 'Đ'.repeat(40) + 'ệ'.repeat(40);
const HTML_REASON = '<b>đậm</b> & "nháy" <img src=x onerror=alert(1)>';
const LONG_HTML_REASON = `<b>${'đ'.repeat(100)}</b> & <i>x</i>`;
const DETAIL_REASON = `Bản đầy đủ lấy từ chi tiết: ${LONG_REASON}`;

function leave(overrides: Partial<AdminLeaveItem>): AdminLeaveItem {
  return {
    yeuCauNghiPhepId: '1',
    trangThai: 'ChoDuyet',
    hinhThuc: 'TheoCa',
    tuNgay: '2026-10-29',
    denNgay: '2026-10-29',
    ca: 'CaChieu',
    lyDo: SHORT_REASON,
    thoiDiemTao: '2026-10-18T03:00:00.000Z',
    thoiDiemXuLy: null,
    bacSi: { bacSiId: '11', hoTen: NAME },
    chuyenKhoa: { ten: 'Tim mạch' },
    chiNhanh: Q3,
    soLichHenBiAnhHuong: 0,
    ...overrides,
  };
}

const ITEMS: AdminLeaveItem[] = [
  leave({ yeuCauNghiPhepId: '1', lyDo: SHORT_REASON }),
  leave({
    yeuCauNghiPhepId: '2',
    trangThai: 'DaDuyet',
    thoiDiemXuLy: '2026-10-19T03:00:00.000Z',
    lyDo: LONG_REASON,
  }),
  leave({
    yeuCauNghiPhepId: '3',
    trangThai: 'TuChoi',
    thoiDiemXuLy: '2026-10-19T03:00:00.000Z',
    soLichHenBiAnhHuong: null,
    lyDo: HTML_REASON,
  }),
  leave({ yeuCauNghiPhepId: '4', lyDo: EXACT_80_REASON }),
  leave({ yeuCauNghiPhepId: '5', lyDo: LONG_HTML_REASON }),
];
const DOCTORS: ReceptionDoctor[] = [
  {
    bacSiId: '11',
    hoTen: NAME,
    ngungHoatDong: false,
    chiNhanh: Q3,
    chuyenKhoa: { chuyenKhoaId: '5', ten: 'Tim mạch' },
  },
];
const STATS = { choDuyet: 3, daDuyet: 1, tuChoi: 1, tong: 5 };

const fetchMock = vi.fn<typeof fetch>();
let api: ReturnType<typeof createFakeAuthApi>;

beforeEach(() => {
  resetAuthForTest();
  api = createFakeAuthApi({
    vaiTro: 'QuanTriVien',
    hoTen: 'Admin CLINIX',
    daXacMinhEmail: true,
  });
  fetchMock.mockReset();
  fetchMock.mockImplementation((input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/admin/me'))
      return Promise.resolve(jsonResponse({ phamVi: 'ToanHeThong' }));
    if (url.pathname.endsWith('/admin/doctor-shifts/doctors'))
      return Promise.resolve(
        jsonResponse({ items: DOCTORS, total: 1, page: 1, pageSize: 100 }),
      );
    if (/\/admin\/leave-requests\/\d+$/.test(url.pathname)) {
      const id = url.pathname.split('/').pop();
      const item = ITEMS.find((i) => i.yeuCauNghiPhepId === id) ?? ITEMS[0];
      // Chi tiết trả lý do ĐẦY ĐỦ từ chính nó: khác với bản trong danh sách để chứng minh ngăn kéo lấy từ GET /:id
      return Promise.resolve(
        jsonResponse({
          ...item,
          lyDo: DETAIL_REASON,
          lichHenBiAnhHuong: {
            tong: 0,
            soBenhNhan: 0,
            soCoCoc: 0,
            conNua: false,
            items: [],
          },
        }),
      );
    }
    if (url.pathname.endsWith('/admin/leave-requests'))
      return Promise.resolve(
        jsonResponse({
          items: ITEMS,
          total: ITEMS.length,
          page: 1,
          pageSize: 10,
          thongKe: STATS,
        }),
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

async function renderTable() {
  api.startSession();
  await restoreSession();
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [ADMIN_LEAVE_APPROVALS_PATH],
  });
  render(<RouterProvider router={router} />);
  return screen.findByRole('table', { name: 'Yêu cầu nghỉ phép của bác sĩ' });
}

// Hàng thứ `index` (0 = đầu bảng) và ô của nó theo tiêu đề cột
function cellOf(table: HTMLElement, index: number, header: string) {
  const headers = within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  const row = within(table).getAllByRole('row')[index + 1];
  return within(row).getAllByRole('cell')[headers.indexOf(header)];
}

describe('trang Duyệt yêu cầu: cột Lý do nghỉ và badge cạnh tên (doctor UX2)', () => {
  it('DUX2-30 WA-07 bảng có TÁM cột, "Lý do nghỉ" nằm giữa "Thời gian" và "Ngày gửi"', async () => {
    const table = await renderTable();

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
  });

  it('DUX2-31 lý do ngắn (và đúng 80 điểm mã) hiện nguyên văn, KHÔNG cắt và KHÔNG có title', async () => {
    const table = await renderTable();

    for (const [index, reason] of [
      [0, SHORT_REASON],
      [3, EXACT_80_REASON],
    ] as const) {
      const cell = cellOf(table, index, 'Lý do nghỉ');
      expect(cell).toHaveTextContent(reason);
      expect(cell.textContent).toBe(reason);
      expect(cell.querySelector('[title]')).toBeNull();
      expect(cell.querySelector('[aria-hidden]')).toBeNull();
    }
  });

  it('DUX2-32 lý do dài hơn 80 điểm mã: hiện 80 điểm mã đầu cộng "…" và rê chuột (title) hiện ĐỦ', async () => {
    const table = await renderTable();
    const cell = cellOf(table, 1, 'Lý do nghỉ');

    const visible = cell.querySelector('[title]');
    expect(visible).not.toBeNull();
    expect(visible).toHaveTextContent(LONG_PREVIEW);
    expect(visible?.textContent).toBe(LONG_PREVIEW);
    expect(visible).toHaveAttribute('title', LONG_REASON);
    expect(LONG_PREVIEW.endsWith('…')).toBe(true);
  });

  it('DUX2-33 trợ năng: trình đọc màn hình đọc ĐỦ lý do một lần (chữ ẩn thị giác), bản cắt bị ẩn khỏi cây trợ năng', async () => {
    const table = await renderTable();
    const cell = cellOf(table, 1, 'Lý do nghỉ');

    const full = within(cell).getByText(LONG_REASON);
    expect(full).toHaveClass('sr-only');
    expect(cell.querySelector('[title]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    // Hai bản trong cùng một ô: một cho mắt (cắt), một cho trình đọc (đủ), không thêm chỗ nào khác
    expect(cell.querySelectorAll('span')).toHaveLength(2);
  });

  it('DUX2-34 lý do là chữ của người dùng: <b>, <img>, & và dấu nháy hiện như CHỮ THƯỜNG, không sinh phần tử, kể cả khi bị cắt', async () => {
    const table = await renderTable();

    const plain = cellOf(table, 2, 'Lý do nghỉ');
    expect(plain.textContent).toBe(HTML_REASON);
    expect(plain.querySelector('b, img, i, script')).toBeNull();

    const cutRow = cellOf(table, 4, 'Lý do nghỉ');
    expect(cutRow.querySelector('b, img, i, script')).toBeNull();
    expect(cutRow.querySelector('[title]')).toHaveAttribute(
      'title',
      LONG_HTML_REASON,
    );
    expect(cutRow.querySelector('[title]')?.textContent).toBe(
      `<b>${'đ'.repeat(77)}…`,
    );
  });

  it('DUX2-35 G14 ô Bác sĩ: nút tên và badge chuyên khoa CÙNG một hàng (cùng phần tử cha), chi nhánh ở hàng sau (ngoài hàng đó)', async () => {
    const table = await renderTable();
    const cell = cellOf(table, 0, 'Bác sĩ');

    const name = within(cell).getByRole('button', { name: NAME });
    const badge = within(cell).getByText('Tim mạch');
    const branch = within(cell).getByText(Q3.ten);

    expect(badge.parentElement).toBe(name.parentElement);
    expect(branch.parentElement).not.toBe(name.parentElement);
    expect(name.parentElement?.contains(branch)).toBe(false);
    // Thứ tự đọc: tên, badge, rồi chi nhánh
    expect(
      Array.from(cell.querySelectorAll('button, span')).map(
        (e) => e.textContent,
      ),
    ).toEqual([NAME, 'Tim mạch', Q3.ten]);
  });

  it('DUX2-36 nút Duyệt và Từ chối vẫn có tên truy cập kèm họ tên bác sĩ', async () => {
    const table = await renderTable();

    expect(
      within(table).getAllByRole('button', {
        name: `Duyệt yêu cầu của ${NAME}`,
      }),
    ).toHaveLength(3);
    expect(
      within(table).getAllByRole('button', {
        name: `Từ chối yêu cầu của ${NAME}`,
      }),
    ).toHaveLength(3);
  });

  it('DUX2-37 WA-08 ngăn kéo chi tiết vẫn hiện lý do ĐẦY ĐỦ lấy từ GET /:id (không phải bản cắt của danh sách)', async () => {
    const table = await renderTable();
    const cell = cellOf(table, 1, 'Bác sĩ');

    fireEvent.click(within(cell).getByRole('button', { name: NAME }));

    const drawer = await screen.findByRole('dialog', { name: NAME });
    expect(await within(drawer).findByText(DETAIL_REASON)).toBeVisible();
    expect(within(drawer).queryByText(LONG_PREVIEW)).toBeNull();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith('/admin/leave-requests/2'),
        ),
      ).toHaveLength(1),
    );
  });

  it('DUX2-38 mọi trạng thái (Chờ duyệt, Đã duyệt, Từ chối) đều có lý do ở đúng hàng của mình', async () => {
    const table = await renderTable();

    expect(cellOf(table, 0, 'Trạng thái')).toHaveTextContent('Chờ duyệt');
    expect(cellOf(table, 0, 'Lý do nghỉ').textContent).toBe(SHORT_REASON);
    expect(cellOf(table, 1, 'Trạng thái')).toHaveTextContent('Đã duyệt');
    expect(
      cellOf(table, 1, 'Lý do nghỉ').querySelector('[title]'),
    ).toHaveAttribute('title', LONG_REASON);
    expect(cellOf(table, 2, 'Trạng thái')).toHaveTextContent('Từ chối');
    expect(cellOf(table, 2, 'Lý do nghỉ').textContent).toBe(HTML_REASON);
  });
});
