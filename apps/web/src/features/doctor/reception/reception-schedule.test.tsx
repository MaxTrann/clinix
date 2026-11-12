import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type {
  ReceptionDoctor,
  ReceptionDoctorRow,
  ReceptionShift,
} from '../api/reception-api';
import { jsonResponse } from '../testing/fetch-routing';
import {
  FORBIDDEN_MESSAGE,
  NOT_FOUND_MESSAGE,
  READ_ONLY_NOTE,
} from './reception-labels';
import { RECEPTION_SCHEDULE_PATH } from './reception-paths';
import { ReceptionSchedulePage } from './reception-schedule-page';

// doctor F5: WL-08 (lưới chỉ xem, lọc, ngăn kéo), WL-09 (403 khi sửa URL), WL-10 (không có số lịch hẹn). Hôm nay = thứ Tư 14/10/2026 giờ VN.
const fetchMock = vi.fn<typeof fetch>();
let gridResponse: () => Response | Promise<Response>;

const DOCTOR_A: ReceptionDoctor = {
  bacSiId: '11',
  hoTen: 'ThS.BS. Nguyễn Minh Anh',
  ngungHoatDong: false,
  chiNhanh: { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' },
  chuyenKhoa: { chuyenKhoaId: '5', ten: 'Tim mạch' },
};
const DOCTOR_B: ReceptionDoctor = {
  bacSiId: '12',
  hoTen: 'BS.CKII Trần Quốc Huy',
  ngungHoatDong: false,
  chiNhanh: DOCTOR_A.chiNhanh,
  chuyenKhoa: { chuyenKhoaId: '6', ten: 'Cơ Xương Khớp' },
};

function shift(overrides: Partial<ReceptionShift>): ReceptionShift {
  return {
    lichLamViecId: '1',
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
      shift({ lichLamViecId: '1', ngay: '2026-10-12', ca: 'CaSang' }),
      shift({
        lichLamViecId: '2',
        ngay: '2026-10-13',
        ca: 'CaSang',
        nghiPhep: 'DaDuyet',
      }),
      shift({
        lichLamViecId: '3',
        ngay: '2026-10-14',
        ca: 'CaChieu',
        batDau: '13:30',
        ketThuc: '17:00',
        nghiPhep: 'ChoDuyet',
      }),
    ],
  },
  {
    ...DOCTOR_B,
    ca: [shift({ lichLamViecId: '4', ngay: '2026-10-14', ca: 'CaSang' })],
  },
];

function grid(rows = ROWS, total = rows.length) {
  return jsonResponse({
    tuNgay: '2026-10-12',
    denNgay: '2026-10-18',
    items: rows,
    total,
    page: 1,
    pageSize: 50,
  });
}

function gridCalls() {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.endsWith('/reception/doctor-schedules'));
}

beforeEach(() => {
  gridResponse = () => grid();
  fetchMock.mockReset();
  fetchMock.mockImplementation((input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/profile'))
      return Promise.resolve(
        jsonResponse({
          chiNhanh: { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' },
        }),
      );
    if (url.pathname.endsWith('/reception/doctor-schedules/doctors'))
      return Promise.resolve(
        jsonResponse({
          items: [DOCTOR_A, DOCTOR_B],
          total: 2,
          page: 1,
          pageSize: 100,
        }),
      );
    if (url.pathname.endsWith('/reception/doctor-schedules'))
      return Promise.resolve(gridResponse());
    return Promise.resolve(
      jsonResponse({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderPage(search = '') {
  const router = createMemoryRouter(
    [{ path: RECEPTION_SCHEDULE_PATH, element: <ReceptionSchedulePage /> }],
    { initialEntries: [`${RECEPTION_SCHEDULE_PATH}${search}`] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const cell = (name: RegExp) => screen.findByRole('button', { name });

describe('lưới Lễ tân (F5)', () => {
  it('WL-08 lưới tuần: tiêu đề, "Chỉ xem" + chip chi nhánh, khối từng bác sĩ kèm chuyên khoa, ô đúng trạng thái, chân trang chỉ xem', async () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Lịch làm việc bác sĩ' }),
    ).toBeVisible();
    expect(await screen.findByText('CLINIX Chi nhánh Quận 3')).toBeVisible();
    expect(screen.getByText('Chỉ xem')).toBeVisible();

    const table = await screen.findByRole('table', {
      name: 'Lịch làm việc của các bác sĩ theo tuần',
    });
    expect(within(table).getByText('ThS.BS. Nguyễn Minh Anh')).toBeVisible();
    expect(within(table).getByText('Tim mạch')).toBeVisible();
    expect(within(table).getByText('BS.CKII Trần Quốc Huy')).toBeVisible();
    expect(
      within(table).getByRole('button', {
        name: /ThS.BS. Nguyễn Minh Anh, Ca sáng, Thứ 2, 12\/10\/2026, Làm việc/,
      }),
    ).toHaveTextContent('Làm việc');
    expect(
      within(table).getByRole('button', {
        name: /Thứ 3, 13\/10\/2026, Nghỉ phép/,
      }),
    ).toHaveTextContent('Nghỉ phép');
    expect(
      within(table).getByRole('button', {
        name: /Ca chiều, Thứ 4, 14\/10\/2026, Chờ duyệt/,
      }),
    ).toHaveTextContent('Chờ duyệt');
    // Cột: CA + T2…CN; hôm nay (T4 14/10) có dấu
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers[0]).toBe('CA');
    expect(headers[1]).toContain('T2');
    expect(headers[7]).toContain('CN');
    expect(
      within(table).getByRole('img', { name: 'Hôm nay' }),
    ).toBeInTheDocument();
    expect(screen.getByText(READ_ONLY_NOTE)).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Chú giải' }))
        .getAllByRole('listitem')
        .map((i) => i.textContent),
    ).toEqual(['Làm việc', 'Nghỉ phép', 'Chờ duyệt', 'Không có lịch']);
  });

  it('WL-08 chỉ xem: không có nút "+", Phân công, Sửa, Gỡ; mọi lời gọi là GET; không gửi chi nhánh', async () => {
    renderPage();
    await cell(/Thứ 2, 12\/10\/2026, Làm việc/);
    for (const name of [/phân công/i, /^sửa/i, /gỡ/i, /^\+$/, /xóa|xoá/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(
      fetchMock.mock.calls.every(
        ([, init]) => (init?.method ?? 'GET') === 'GET',
      ),
    ).toBe(true);
    const [first] = gridCalls();
    expect(first.searchParams.get('tuNgay')).toBe('2026-10-12');
    expect(first.searchParams.get('denNgay')).toBe('2026-10-18');
    expect(first.searchParams.get('pageSize')).toBe('50');
    expect(first.searchParams.has('chiNhanhId')).toBe(false);
  });

  it('WL-10 không có số lịch hẹn: không có "lịch khám", "N lịch hẹn", "Chưa có lịch" ở lưới', async () => {
    renderPage();
    const table = await screen.findByRole('table', {
      name: /Lịch làm việc của các bác sĩ/,
    });
    expect(table.textContent).not.toMatch(/lịch khám|\d+ lịch|Chưa có lịch/i);
  });

  it('WL-08 lọc chuyên khoa: gọi lại với chuyenKhoaId, danh sách bác sĩ chỉ còn bác sĩ của chuyên khoa', async () => {
    renderPage();
    await cell(/Thứ 2, 12\/10\/2026, Làm việc/);
    fireEvent.change(screen.getByLabelText('Lọc theo chuyên khoa'), {
      target: { value: '6' },
    });
    await waitFor(() =>
      expect(gridCalls().at(-1)!.searchParams.get('chuyenKhoaId')).toBe('6'),
    );
    const doctorSelect = screen.getByLabelText('Lọc theo bác sĩ');
    expect(
      within(doctorSelect).queryByRole('option', {
        name: 'ThS.BS. Nguyễn Minh Anh',
      }),
    ).toBeNull();
    expect(
      within(doctorSelect).getByRole('option', {
        name: 'BS.CKII Trần Quốc Huy',
      }),
    ).toBeInTheDocument();
  });

  it('WL-08 lọc ca gọi lại với ca; lọc trạng thái làm ở giao diện, KHÔNG gọi lại', async () => {
    renderPage();
    await cell(/Thứ 2, 12\/10\/2026, Làm việc/);
    fireEvent.change(screen.getByLabelText('Lọc theo ca'), {
      target: { value: 'CaChieu' },
    });
    await waitFor(() =>
      expect(gridCalls().at(-1)!.searchParams.get('ca')).toBe('CaChieu'),
    );

    const before = gridCalls().length;
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: 'ChoDuyet' },
    });
    await cell(/Chờ duyệt/);
    expect(screen.queryByRole('button', { name: /Nghỉ phép/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Thứ 2, 12\/10\/2026, Làm việc/ }),
    ).toBeNull();
    expect(gridCalls()).toHaveLength(before);
  });

  it('WL-08 chọn bác sĩ: id nằm ở URL (?bacSiId=) và lưới gọi lại với bacSiId; "Tất cả bác sĩ" xoá khỏi URL', async () => {
    const router = renderPage();
    await cell(/Thứ 2, 12\/10\/2026, Làm việc/);
    fireEvent.change(screen.getByLabelText('Lọc theo bác sĩ'), {
      target: { value: '12' },
    });
    await waitFor(() =>
      expect(gridCalls().at(-1)!.searchParams.get('bacSiId')).toBe('12'),
    );
    expect(router.state.location.search).toBe('?bacSiId=12');

    fireEvent.change(screen.getByLabelText('Lọc theo bác sĩ'), {
      target: { value: 'all' },
    });
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(gridCalls().at(-1)!.searchParams.has('bacSiId')).toBe(false);
  });

  it('WL-08 chuyển tuần và "Hôm nay": khoảng ngày đúng; đổi tuần về trang 1', async () => {
    renderPage();
    await screen.findByText('12/10 – 18/10/2026');
    fireEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(await screen.findByText('19/10 – 25/10/2026')).toBeVisible();
    await waitFor(() =>
      expect(gridCalls().at(-1)!.searchParams.get('tuNgay')).toBe('2026-10-19'),
    );
    expect(gridCalls().at(-1)!.searchParams.get('denNgay')).toBe('2026-10-25');
    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    expect(await screen.findByText('12/10 – 18/10/2026')).toBeVisible();
  });

  it('WL-08 rỗng: không có bác sĩ nào ⇒ thông báo; nhiều bác sĩ ⇒ phân trang 50/trang', async () => {
    gridResponse = () => grid([], 0);
    renderPage();
    expect(
      await screen.findByText('Không có bác sĩ nào phù hợp với bộ lọc.'),
    ).toBeVisible();
  });

  it('WL-08 phân trang: 120 bác sĩ ⇒ 3 trang; "Trang sau" gọi page=2', async () => {
    gridResponse = () => grid(ROWS, 120);
    renderPage();
    expect(await screen.findByText('Trang 1/3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() =>
      expect(gridCalls().at(-1)!.searchParams.get('page')).toBe('2'),
    );
  });
});

describe('lỗi và quyền (F5)', () => {
  it('WL-09 sửa URL sang bác sĩ ngoài phạm vi: 403 ⇒ "Bạn không có quyền xem lịch của bác sĩ này.", không có "Thử lại", không lộ lưới', async () => {
    gridResponse = () =>
      jsonResponse({ maLoi: 'KHONG_DU_QUYEN', thongBao: 'thân thô' }, 403);
    renderPage('?bacSiId=999');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      FORBIDDEN_MESSAGE,
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/thân thô/)).toBeNull();
    expect(gridCalls()[0].searchParams.get('bacSiId')).toBe('999');
    // Bộ lọc vẫn dùng được để thoát khỏi lỗi
    gridResponse = () => grid();
    fireEvent.change(screen.getByLabelText('Lọc theo bác sĩ'), {
      target: { value: 'all' },
    });
    expect(await cell(/Thứ 2, 12\/10\/2026, Làm việc/)).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('WL-09 id sai dạng ở URL: 404 ⇒ "Không tìm thấy dữ liệu."', async () => {
    gridResponse = () =>
      jsonResponse({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404);
    renderPage('?bacSiId=abc');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      NOT_FOUND_MESSAGE,
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('lỗi 500: câu chung + "Thử lại" tải lại được', async () => {
    gridResponse = () =>
      jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500);
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra');
    gridResponse = () => grid();
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await cell(/Thứ 2, 12\/10\/2026, Làm việc/)).toBeVisible();
  });

  it('mất mạng: thông báo mất kết nối; không lấy được chi nhánh thì không có chip nhưng trang vẫn dùng được', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) =>
      String(input).includes('/profile')
        ? Promise.reject(new TypeError('x'))
        : original(input, init),
    );
    renderPage();
    await cell(/Thứ 2, 12\/10\/2026, Làm việc/);
    expect(screen.queryByText('CLINIX Chi nhánh Quận 3')).toBeNull();
  });
});

describe('ngăn kéo (F5)', () => {
  it('WL-08 bấm ô: ngăn kéo "Chi tiết ca" có bác sĩ, chuyên khoa, ngày, ca + giờ, trạng thái; nút "Quản lý lịch hẹn" vô hiệu; không có mục lịch hẹn giả; Esc trả focus', async () => {
    renderPage();
    const target = await cell(
      /ThS.BS. Nguyễn Minh Anh, Ca chiều, Thứ 4, 14\/10\/2026, Chờ duyệt/,
    );
    fireEvent.click(target);
    const drawer = await screen.findByRole('dialog', {
      name: 'ThS.BS. Nguyễn Minh Anh',
    });
    expect(within(drawer).getByText('Tim mạch')).toBeVisible();
    expect(within(drawer).getByText('14/10/2026')).toBeVisible();
    expect(within(drawer).getByText(/Ca chiều · 13:30–17:00/)).toBeVisible();
    expect(within(drawer).getByText('Chờ duyệt')).toBeVisible();
    const action = within(drawer).getByRole('button', {
      name: /Quản lý lịch hẹn/,
    });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    expect(drawer.textContent).not.toMatch(/LỊCH HẸN TRONG CA|\d+ lịch/i);
    fireEvent.click(action);
    expect(screen.getByRole('dialog')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(target).toHaveFocus();
  });

  it('WL-08 bấm tiêu đề cột: ngăn kéo "Chi tiết ngày" liệt kê từng ca với mọi bác sĩ; "Không có lịch" cho bác sĩ không có ca; nút vô hiệu', async () => {
    renderPage();
    await cell(/Thứ 2, 12\/10\/2026, Làm việc/);
    fireEvent.click(
      screen.getByRole('button', { name: /Chi tiết ngày Thứ 4, 14\/10\/2026/ }),
    );
    const drawer = await screen.findByRole('dialog', {
      name: 'Thứ 4, 14/10/2026',
    });
    expect(within(drawer).getByText('2 ca làm việc')).toBeVisible();
    const morning = within(
      within(drawer).getByRole('region', { name: 'Ca sáng' }),
    );
    expect(
      morning.getByText('BS.CKII Trần Quốc Huy').closest('li'),
    ).toHaveTextContent('Làm việc');
    expect(
      morning.getByText('ThS.BS. Nguyễn Minh Anh').closest('li'),
    ).toHaveTextContent('Không có lịch');
    const afternoon = within(
      within(drawer).getByRole('region', { name: 'Ca chiều' }),
    );
    expect(
      afternoon.getByText('ThS.BS. Nguyễn Minh Anh').closest('li'),
    ).toHaveTextContent('Chờ duyệt');
    expect(
      within(drawer).getByRole('button', {
        name: /Xem trong Quản lý lịch hẹn/,
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('WL-08 ngày không có ca (Chủ nhật 18/10): tiêu đề "Chủ nhật, 18/10/2026" và "Không có ca làm việc"', async () => {
    renderPage();
    await cell(/Thứ 2, 12\/10\/2026, Làm việc/);
    fireEvent.click(
      screen.getByRole('button', { name: /Chi tiết ngày CN, 18\/10\/2026/ }),
    );
    const drawer = await screen.findByRole('dialog', {
      name: 'Chủ nhật, 18/10/2026',
    });
    expect(within(drawer).getByText('Không có ca làm việc')).toBeVisible();
    expect(within(drawer).getAllByText('Không có lịch').length).toBe(4);
  });
});
