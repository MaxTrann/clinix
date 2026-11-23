import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, MemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type {
  ReceptionDoctor,
  ReceptionDoctorRow,
  ReceptionShift,
} from '../api/reception-api';
import { receptionAppointmentsHref } from '../appointments/appointment-links';
import { jsonResponse } from '../testing/fetch-routing';
import { RECEPTION_SCHEDULE_PATH } from './reception-paths';
import { ReceptionSchedulePage } from './reception-schedule-page';
import { ScheduleBoard } from './schedule-board';

// doctor UX6 (G9, G11): ngăn kéo "Chi tiết ca" và "Chi tiết ngày" của Lễ tân có lịch hẹn theo mốc giờ, số lịch từng bác sĩ theo trạng thái, và nút "Quản lý lịch hẹn"
// là liên kết thật. DUX6-40 đến DUX6-56 [đề xuất]; phủ WL-08, WL-13 [đề xuất]. Chỉ dữ liệu GIẢ. `fetch` giả mô phỏng ĐÚNG hợp đồng của backend: lọc `bacSiId`,
// phân trang tối đa 100, `total` luôn có, và dòng lịch hẹn KHÔNG có `ca` lẫn `bacSiId` (chỉ có TÊN bác sĩ), kèm `nguoiDat` với SĐT để chứng minh web không hiện nó.
// Hôm nay = thứ Tư 14/10/2026 giờ Việt Nam.
const fetchMock = vi.fn<typeof fetch>();
const DAY = '2026-10-14';

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
    ngay: DAY,
    ca: 'CaSang',
    batDau: '08:00',
    ketThuc: '12:00',
    gioCaKhongCon: false,
    nghiPhep: null,
    ...overrides,
  };
}

const AFTERNOON = {
  ca: 'CaChieu',
  batDau: '13:00',
  ketThuc: '17:00',
} as const;

let gridRows: ReceptionDoctorRow[];

// Mỗi lịch hẹn giả nhớ bác sĩ nào (để API giả lọc `bacSiId` như server) nhưng KHÔNG đưa id đó ra phản hồi
interface FakeAppointment {
  doctor: ReceptionDoctor;
  isoUtc: string;
  trangThai: string;
  name?: string;
}
let appointments: FakeAppointment[];
let appointmentsHandler: ((url: URL) => Response | Promise<Response>) | null;

function serve(url: URL): Response {
  const bacSiId = url.searchParams.get('bacSiId');
  const page = Number(url.searchParams.get('page') ?? '1');
  const size = Number(url.searchParams.get('pageSize') ?? '20');
  const matched = appointments.filter(
    (item) => bacSiId === null || item.doctor.bacSiId === bacSiId,
  );
  const items = matched
    .slice((page - 1) * size, page * size)
    .map((item, i) => ({
      maLichHen: `CLX-20261014-${String((page - 1) * size + i + 1).padStart(5, '0')}`,
      trangThai: item.trangThai,
      thoiGian: item.isoUtc,
      bacSi: item.doctor.hoTen,
      chuyenKhoa: item.doctor.chuyenKhoa.ten,
      chiNhanh: 'CLINIX Chi nhánh Quận 3',
      dichVu: 'Khám chuyên khoa mẫu',
      nguoiKham: {
        hoTen: item.name ?? `Bệnh nhân Mẫu ${(page - 1) * size + i + 1}`,
        laBanThan: true,
      },
      nguoiDat: { hoTen: 'Người đặt Mẫu', soDienThoai: '0900000000' },
      giaSnapshot: '200000.00',
      tienCoc: '0.00',
    }));
  return jsonResponse({ items, total: matched.length, page, pageSize: size });
}

function appointmentCalls(): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.endsWith('/reception/appointments'));
}

beforeEach(() => {
  gridRows = [
    {
      ...DOCTOR_A,
      ca: [
        shift({ lichLamViecId: '1' }),
        shift({ lichLamViecId: '2', ...AFTERNOON }),
      ],
    },
    { ...DOCTOR_B, ca: [shift({ lichLamViecId: '3' })] },
  ];
  appointments = [];
  appointmentsHandler = null;
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
      return Promise.resolve(
        jsonResponse({
          tuNgay: '2026-10-12',
          denNgay: '2026-10-18',
          items: gridRows,
          total: gridRows.length,
          page: 1,
          pageSize: 50,
        }),
      );
    if (url.pathname.endsWith('/reception/appointments'))
      return Promise.resolve(
        appointmentsHandler ? appointmentsHandler(url) : serve(url),
      );
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

function renderPage() {
  const router = createMemoryRouter(
    [{ path: RECEPTION_SCHEDULE_PATH, element: <ReceptionSchedulePage /> }],
    { initialEntries: [RECEPTION_SCHEDULE_PATH] },
  );
  render(<RouterProvider router={router} />);
}

async function openShift(name: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog');
}

async function openDay() {
  await screen.findAllByRole('button', {
    name: /Ca sáng, Thứ 4, 14\/10\/2026/,
  });
  fireEvent.click(
    screen.getByRole('button', { name: /Chi tiết ngày Thứ 4, 14\/10\/2026/ }),
  );
  return screen.findByRole('dialog', { name: 'Thứ 4, 14/10/2026' });
}

const at = (hhmmVn: string) => {
  // Giờ Việt Nam = UTC + 7: 08:30 VN là 01:30Z
  const [h, m] = hhmmVn.split(':').map(Number);
  return `2026-10-14T${String(h - 7).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
};

describe('ngăn kéo "Chi tiết ca" của Lễ tân (G9)', () => {
  it('DUX6-40 mở gọi ĐÚNG MỘT lần: có bacSiId của bác sĩ, tuNgay = denNgay = ngày của ca, pageSize=100; KHÔNG gửi chi nhánh', async () => {
    renderPage();
    const drawer = await openShift(
      /ThS.BS. Nguyễn Minh Anh, Ca sáng, Thứ 4, 14\/10\/2026/,
    );
    await within(drawer).findByText('Ca này chưa có lịch hẹn.');
    const calls = appointmentCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('bacSiId')).toBe('11');
    expect(calls[0].searchParams.get('tuNgay')).toBe(DAY);
    expect(calls[0].searchParams.get('denNgay')).toBe(DAY);
    expect(calls[0].searchParams.get('pageSize')).toBe('100');
    expect(calls[0].searchParams.has('chiNhanhId')).toBe(false);
  });

  it('DUX6-41 chỉ lịch của ĐÚNG ca: 08:30 và 11:59 thuộc ca sáng, 12:00 và 13:30 thuộc ca chiều; mốc giờ theo giờ Việt Nam', async () => {
    appointments = [
      { doctor: DOCTOR_A, isoUtc: at('08:30'), trangThai: 'DaXacNhan' },
      { doctor: DOCTOR_A, isoUtc: at('11:59'), trangThai: 'DaTiepDon' },
      { doctor: DOCTOR_A, isoUtc: at('12:00'), trangThai: 'DaXacNhan' },
      { doctor: DOCTOR_A, isoUtc: at('13:30'), trangThai: 'HoanThanh' },
      { doctor: DOCTOR_B, isoUtc: at('09:00'), trangThai: 'DaXacNhan' },
    ];
    renderPage();
    const morning = await openShift(
      /ThS.BS. Nguyễn Minh Anh, Ca sáng, Thứ 4, 14\/10\/2026/,
    );
    const list = await within(morning).findByRole('list', {
      name: 'Lịch hẹn trong ca',
    });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.slice(0, 5)),
    ).toEqual(['08:30', '11:59']);
    fireEvent.click(within(morning).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const afternoon = await openShift(
      /ThS.BS. Nguyễn Minh Anh, Ca chiều, Thứ 4, 14\/10\/2026/,
    );
    const second = await within(afternoon).findByRole('list', {
      name: 'Lịch hẹn trong ca',
    });
    expect(
      within(second)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.slice(0, 5)),
    ).toEqual(['12:00', '13:30']);
  });

  it('DUX6-42 tổng theo trạng thái ở đầu mục (Đã hủy không vào tổng nhưng vẫn hiện ở cuối)', async () => {
    appointments = [
      { doctor: DOCTOR_A, isoUtc: at('08:00'), trangThai: 'DaXacNhan' },
      { doctor: DOCTOR_A, isoUtc: at('08:30'), trangThai: 'DaTiepDon' },
      { doctor: DOCTOR_A, isoUtc: at('09:00'), trangThai: 'HoanThanh' },
      { doctor: DOCTOR_A, isoUtc: at('09:30'), trangThai: 'DaHuy' },
    ];
    renderPage();
    const drawer = await openShift(
      /ThS.BS. Nguyễn Minh Anh, Ca sáng, Thứ 4, 14\/10\/2026/,
    );
    expect(
      await within(drawer).findByText(
        '3 lịch hẹn: 1 Đã xác nhận · 1 Đã tiếp đón · 1 Hoàn thành · 1 Đã hủy',
      ),
    ).toBeVisible();
  });

  it('DUX6-43 nút "Quản lý lịch hẹn" là LIÊN KẾT bấm được tới trang Lịch hẹn của Lễ tân kèm ngày của ca và bác sĩ; hết "chưa được triển khai"', async () => {
    renderPage();
    const drawer = await openShift(
      /ThS.BS. Nguyễn Minh Anh, Ca sáng, Thứ 4, 14\/10\/2026/,
    );
    const link = within(drawer).getByRole('link', { name: 'Quản lý lịch hẹn' });
    expect(link).toHaveAttribute(
      'href',
      receptionAppointmentsHref({ day: DAY, doctorId: '11' }),
    );
    expect(link).not.toHaveAttribute('aria-disabled');
    expect(drawer.textContent).not.toMatch(/chưa được triển khai/i);
    expect(
      within(drawer).queryByRole('button', { name: /Quản lý lịch hẹn/ }),
    ).toBeNull();
  });

  it('DUX6-53 KHÔNG hiện người đặt, SĐT, giá hay cọc (API Lễ tân có trả nhưng ngăn kéo không cần)', async () => {
    appointments = [
      { doctor: DOCTOR_A, isoUtc: at('08:30'), trangThai: 'DaXacNhan' },
    ];
    renderPage();
    const drawer = await openShift(
      /ThS.BS. Nguyễn Minh Anh, Ca sáng, Thứ 4, 14\/10\/2026/,
    );
    await within(drawer).findByRole('list', { name: 'Lịch hẹn trong ca' });
    for (const secret of ['0900000000', 'Người đặt Mẫu', '200000', 'CLX-']) {
      expect(drawer.textContent).not.toContain(secret);
    }
  });

  it('DUX6-54 đóng ngăn kéo khi đang tải: yêu cầu bị HUỶ (signal) và không có thông báo lỗi muộn', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname.endsWith('/reception/appointments')) {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }
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
        return Promise.resolve(
          jsonResponse({
            tuNgay: '2026-10-12',
            denNgay: '2026-10-18',
            items: gridRows,
            total: gridRows.length,
            page: 1,
            pageSize: 50,
          }),
        );
      return Promise.resolve(jsonResponse({ chiNhanh: null }));
    });
    renderPage();
    const drawer = await openShift(
      /ThS.BS. Nguyễn Minh Anh, Ca sáng, Thứ 4, 14\/10\/2026/,
    );
    await within(drawer).findByText('Đang tải lịch hẹn trong ca...');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('DUX6-55 lọc trạng thái ẩn ca sáng của bác sĩ: số của ca chiều vẫn đúng (ranh giới lấy từ giờ bắt đầu ca chiều)', async () => {
    gridRows[0].ca = [
      shift({ lichLamViecId: '1', nghiPhep: 'DaDuyet' }),
      shift({ lichLamViecId: '2', ...AFTERNOON, nghiPhep: 'ChoDuyet' }),
    ];
    appointments = [
      { doctor: DOCTOR_A, isoUtc: at('12:30'), trangThai: 'DaXacNhan' },
      { doctor: DOCTOR_A, isoUtc: at('13:30'), trangThai: 'DaXacNhan' },
    ];
    renderPage();
    await screen.findByRole('button', {
      name: /Ca chiều, Thứ 4, 14\/10\/2026, Chờ duyệt/,
    });
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: 'ChoDuyet' },
    });
    const drawer = await openShift(
      /ThS.BS. Nguyễn Minh Anh, Ca chiều, Thứ 4, 14\/10\/2026, Chờ duyệt/,
    );
    // Ca sáng đã bị lọc khỏi lưới: 12:30 (khe giữa) được tính vào ca sáng vì nhỏ hơn 13:00, nên chỉ còn 13:30
    expect(
      await within(drawer).findByText('1 lịch hẹn: 1 Đã xác nhận'),
    ).toBeVisible();
  });

  it('DUX6-51 lỗi: khối lỗi trong ngăn kéo (thông tin ca vẫn hiện) và "Thử lại" gọi lại', async () => {
    let fail = true;
    appointmentsHandler = (url) =>
      fail
        ? jsonResponse({ maLoi: 'LOI_HE_THONG', thongBao: 'nội bộ' }, 500)
        : serve(url);
    renderPage();
    const drawer = await openShift(
      /ThS.BS. Nguyễn Minh Anh, Ca sáng, Thứ 4, 14\/10\/2026/,
    );
    const alert = await within(drawer).findByRole('alert');
    expect(alert).not.toHaveTextContent('nội bộ');
    expect(within(drawer).getByText('Tim mạch')).toBeVisible();
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await within(drawer).findByText('Ca này chưa có lịch hẹn.');
    expect(appointmentCalls()).toHaveLength(2);
  });
});

describe('ngăn kéo "Chi tiết ngày" của Lễ tân (G11)', () => {
  it('DUX6-44 mở gọi ĐÚNG MỘT lần theo ngày (không bacSiId), tuNgay = denNgay', async () => {
    renderPage();
    const drawer = await openDay();
    await within(drawer).findAllByText('Chưa có lịch hẹn');
    const calls = appointmentCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('tuNgay')).toBe(DAY);
    expect(calls[0].searchParams.get('denNgay')).toBe(DAY);
    expect(calls[0].searchParams.has('bacSiId')).toBe(false);
  });

  it('DUX6-45 mỗi dòng (bác sĩ, ca) có số lịch theo trạng thái, đúng ca theo giờ', async () => {
    appointments = [
      { doctor: DOCTOR_A, isoUtc: at('08:00'), trangThai: 'DaXacNhan' },
      { doctor: DOCTOR_A, isoUtc: at('09:00'), trangThai: 'DaTiepDon' },
      { doctor: DOCTOR_A, isoUtc: at('10:00'), trangThai: 'HoanThanh' },
      { doctor: DOCTOR_A, isoUtc: at('14:00'), trangThai: 'DaXacNhan' },
    ];
    renderPage();
    const drawer = await openDay();
    const morning = within(
      within(drawer).getByRole('region', { name: 'Ca sáng' }),
    );
    const afternoon = within(
      within(drawer).getByRole('region', { name: 'Ca chiều' }),
    );
    await waitFor(() =>
      expect(
        morning.getByText('ThS.BS. Nguyễn Minh Anh').closest('li'),
      ).toHaveTextContent(
        '3 lịch hẹn: 1 Đã xác nhận · 1 Đã tiếp đón · 1 Hoàn thành',
      ),
    );
    expect(
      afternoon.getByText('ThS.BS. Nguyễn Minh Anh').closest('li'),
    ).toHaveTextContent('1 lịch hẹn: 1 Đã xác nhận');
  });

  it('DUX6-46 nhiều bác sĩ: số của từng người không lẫn nhau; bác sĩ có ca mà 0 lịch ghi "Chưa có lịch hẹn"', async () => {
    appointments = [
      { doctor: DOCTOR_A, isoUtc: at('08:00'), trangThai: 'DaXacNhan' },
      { doctor: DOCTOR_B, isoUtc: at('08:30'), trangThai: 'HoanThanh' },
      { doctor: DOCTOR_B, isoUtc: at('09:00'), trangThai: 'HoanThanh' },
    ];
    renderPage();
    const drawer = await openDay();
    const morning = within(
      within(drawer).getByRole('region', { name: 'Ca sáng' }),
    );
    await waitFor(() =>
      expect(
        morning.getByText('BS.CKII Trần Quốc Huy').closest('li'),
      ).toHaveTextContent('2 lịch hẹn: 2 Hoàn thành'),
    );
    expect(
      morning.getByText('ThS.BS. Nguyễn Minh Anh').closest('li'),
    ).toHaveTextContent('1 lịch hẹn: 1 Đã xác nhận');
    const afternoon = within(
      within(drawer).getByRole('region', { name: 'Ca chiều' }),
    );
    expect(
      afternoon.getByText('ThS.BS. Nguyễn Minh Anh').closest('li'),
    ).toHaveTextContent('Chưa có lịch hẹn');
    // Bác sĩ B không có ca chiều: giữ "Không có lịch", KHÔNG có dòng số lịch
    expect(
      afternoon.getByText('BS.CKII Trần Quốc Huy').closest('li'),
    ).toHaveTextContent('Không có lịch');
    expect(
      afternoon.getByText('BS.CKII Trần Quốc Huy').closest('li'),
    ).not.toHaveTextContent('Chưa có lịch hẹn');
  });

  it('DUX6-47 hai bác sĩ trùng tên VÀ chuyên khoa: hiện "—", không gán số cho ai', async () => {
    const twin: ReceptionDoctor = {
      ...DOCTOR_B,
      bacSiId: '13',
      hoTen: DOCTOR_A.hoTen,
      chuyenKhoa: DOCTOR_A.chuyenKhoa,
    };
    gridRows = [
      { ...DOCTOR_A, ca: [shift({ lichLamViecId: '1' })] },
      { ...twin, ca: [shift({ lichLamViecId: '4' })] },
    ];
    appointments = [
      { doctor: DOCTOR_A, isoUtc: at('08:00'), trangThai: 'DaXacNhan' },
    ];
    renderPage();
    const drawer = await openDay();
    const morning = within(
      within(drawer).getByRole('region', { name: 'Ca sáng' }),
    );
    await waitFor(() => expect(morning.getAllByText('—')).toHaveLength(2));
    expect(drawer.textContent).not.toMatch(/\d+ lịch hẹn/);
  });

  it('DUX6-48 ca không có lịch giữ "Không có lịch" như cũ (không thêm dòng số)', async () => {
    renderPage();
    const drawer = await openDay();
    await within(drawer).findAllByText('Chưa có lịch hẹn');
    const afternoon = within(
      within(drawer).getByRole('region', { name: 'Ca chiều' }),
    );
    expect(
      afternoon.getByText('BS.CKII Trần Quốc Huy').closest('li'),
    ).toHaveTextContent('Không có lịch');
  });

  it('DUX6-49 ngày có 230 lịch: 3 lời gọi (trang 1, 2, 3), số cộng đủ 230', async () => {
    appointments = Array.from({ length: 230 }, () => ({
      doctor: DOCTOR_A,
      isoUtc: at('08:00'),
      trangThai: 'DaXacNhan',
    }));
    renderPage();
    const drawer = await openDay();
    const morning = within(
      within(drawer).getByRole('region', { name: 'Ca sáng' }),
    );
    await waitFor(() =>
      expect(
        morning.getByText('ThS.BS. Nguyễn Minh Anh').closest('li'),
      ).toHaveTextContent('230 lịch hẹn: 230 Đã xác nhận'),
    );
    expect(
      appointmentCalls()
        .map((url) => url.searchParams.get('page'))
        .sort(),
    ).toEqual(['1', '2', '3']);
  });

  it('DUX6-50 ngày có 600 lịch (quá 500): báo "quá nhiều", KHÔNG hiện số từng bác sĩ, chỉ gọi trang 1', async () => {
    appointments = Array.from({ length: 600 }, () => ({
      doctor: DOCTOR_A,
      isoUtc: at('08:00'),
      trangThai: 'DaXacNhan',
    }));
    renderPage();
    const drawer = await openDay();
    expect(
      await within(drawer).findByText(
        'Ngày này có 600 lịch hẹn, nhiều hơn mức thống kê được ở đây. Xem đầy đủ trong Quản lý lịch hẹn.',
      ),
    ).toBeVisible();
    expect(drawer.textContent).not.toMatch(/\d+ lịch hẹn:/);
    expect(appointmentCalls()).toHaveLength(1);
  });

  it('DUX6-51b một trang lỗi khi tải ngày: khối lỗi và "Thử lại"; không hiện số thiếu', async () => {
    appointments = Array.from({ length: 150 }, () => ({
      doctor: DOCTOR_A,
      isoUtc: at('08:00'),
      trangThai: 'DaXacNhan',
    }));
    appointmentsHandler = (url) =>
      url.searchParams.get('page') === '2'
        ? jsonResponse({ maLoi: 'LOI_HE_THONG' }, 500)
        : serve(url);
    renderPage();
    const drawer = await openDay();
    const alert = await within(drawer).findByRole('alert');
    expect(
      within(alert).getByRole('button', { name: 'Thử lại' }),
    ).toBeVisible();
    expect(drawer.textContent).not.toMatch(/\d+ lịch hẹn:/);
  });

  it('DUX6-56 nút "Xem trong Quản lý lịch hẹn" là liên kết kèm đúng ngày, KHÔNG có bacSiId', async () => {
    renderPage();
    const drawer = await openDay();
    const link = within(drawer).getByRole('link', {
      name: 'Xem trong Quản lý lịch hẹn',
    });
    expect(link).toHaveAttribute(
      'href',
      receptionAppointmentsHref({ day: DAY }),
    );
    expect(link.getAttribute('href')).not.toContain('bacSiId');
  });
});

describe('Admin dùng chung ngăn kéo nhưng KHÔNG gọi API của Lễ tân', () => {
  it('DUX6-52 nguồn "admin": mở ngăn kéo ca và ngày không gọi /reception/appointments; nút "Quản lý lịch hẹn" vẫn vô hiệu', async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), 'http://localhost');
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
        return Promise.resolve(
          jsonResponse({
            tuNgay: '2026-10-12',
            denNgay: '2026-10-18',
            items: gridRows,
            total: gridRows.length,
            page: 1,
            pageSize: 50,
          }),
        );
      return Promise.resolve(
        jsonResponse({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404),
      );
    });
    render(
      <MemoryRouter>
        <ScheduleBoard source="admin" />
      </MemoryRouter>,
    );
    const drawer = await openShift(
      /ThS.BS. Nguyễn Minh Anh, Ca sáng, Thứ 4, 14\/10\/2026/,
    );
    expect(
      within(drawer).getByRole('button', { name: /Quản lý lịch hẹn/ }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(within(drawer).queryByRole('link')).toBeNull();
    expect(within(drawer).queryByText('Lịch hẹn trong ca')).toBeNull();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(
      screen.getByRole('button', { name: /Chi tiết ngày Thứ 4, 14\/10\/2026/ }),
    );
    const day = await screen.findByRole('dialog', {
      name: 'Thứ 4, 14/10/2026',
    });
    expect(
      within(day).getByRole('button', { name: /Xem trong Quản lý lịch hẹn/ }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(appointmentCalls()).toHaveLength(0);
  });
});
