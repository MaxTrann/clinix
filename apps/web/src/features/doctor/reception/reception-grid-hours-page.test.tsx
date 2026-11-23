import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type {
  ReceptionDoctor,
  ReceptionDoctorRow,
  ReceptionShift,
} from '../api/reception-api';
import { jsonResponse } from '../testing/fetch-routing';
import { ALL } from './reception-filters';
import { ScheduleBoard } from './schedule-board';

// doctor UX9: cả trang (có `fetch` giả) của lưới Lễ tân và lưới Admin Toàn hệ thống dùng nhãn giờ THEO TỪNG bác sĩ. DUX9-30, 31 [đề xuất]; phủ WL-08.
// Lọc trạng thái làm ở web (Q15) nên giờ nhãn tính trên ca ĐANG HIỂN THỊ (cùng câu g của UX8). Chỉ dữ liệu GIẢ. Hôm nay = thứ Tư 14/10/2026 giờ Việt Nam.
const fetchMock = vi.fn<typeof fetch>();

const BRANCH_1 = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Mẫu 1' };
const BRANCH_2 = { chiNhanhId: '2', ten: 'CLINIX Chi nhánh Mẫu 2' };
const DOCTOR_A: ReceptionDoctor = {
  bacSiId: '11',
  hoTen: 'ThS.BS. Nguyễn Minh Anh',
  ngungHoatDong: false,
  chiNhanh: BRANCH_1,
  chuyenKhoa: { chuyenKhoaId: '5', ten: 'Tim mạch' },
};
const DOCTOR_B: ReceptionDoctor = {
  bacSiId: '12',
  hoTen: 'BS.CKII Trần Quốc Huy',
  ngungHoatDong: false,
  chiNhanh: BRANCH_2,
  chuyenKhoa: { chuyenKhoaId: '6', ten: 'Cơ Xương Khớp' },
};

let counter = 0;
function shift(overrides: Partial<ReceptionShift>): ReceptionShift {
  counter += 1;
  return {
    lichLamViecId: String(counter),
    ngay: '2026-10-12',
    ca: 'CaSang',
    batDau: '08:00',
    ketThuc: '12:00',
    gioCaKhongCon: false,
    nghiPhep: null,
    ...overrides,
  };
}

let gridRows: ReceptionDoctorRow[];

function serve(prefix: '/reception/doctor-schedules' | '/admin/doctor-shifts') {
  fetchMock.mockImplementation((input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith(`${prefix}/doctors`))
      return Promise.resolve(
        jsonResponse({
          items: [DOCTOR_A, DOCTOR_B],
          total: 2,
          page: 1,
          pageSize: 100,
        }),
      );
    if (url.pathname.endsWith(prefix))
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
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const rowHeaders = (table: HTMLElement) =>
  within(table)
    .getAllByRole('rowheader')
    .map((header) => header.textContent);

describe('nhãn giờ hàng ở trang Lễ tân và Admin (doctor UX9)', () => {
  it('DUX9-30 trang Lễ tân: tuần lệch giờ thì nhãn chỉ chữ ca và mọi ô ghi giờ; lọc còn ca đồng giờ thì nhãn hiện giờ và ô bỏ giờ; bỏ lọc thì trở lại', async () => {
    gridRows = [
      {
        ...DOCTOR_A,
        ca: [
          shift({ ngay: '2026-10-12' }),
          shift({ ngay: '2026-10-13', nghiPhep: 'ChoDuyet' }),
          shift({ ngay: '2026-10-17', ketThuc: '11:30' }),
        ],
      },
    ];
    serve('/reception/doctor-schedules');
    render(
      <MemoryRouter>
        <ScheduleBoard source="reception" />
      </MemoryRouter>,
    );
    const table = await screen.findByRole('table', {
      name: 'Lịch làm việc của các bác sĩ theo tuần',
    });
    // Ca sáng T2 và T3 08:00 – 12:00, T7 08:00 – 11:30: lệch nên nhãn KHÔNG ghi giờ
    expect(rowHeaders(table)).toEqual(['Sáng', 'Chiều']);
    expect(
      within(table).getByRole('button', {
        name: /Thứ 2, 12\/10\/2026, Làm việc, 08:00 – 12:00$/,
      }),
    ).toBeVisible();
    expect(
      within(table).getByRole('button', {
        name: /Thứ 3, 13\/10\/2026, Chờ duyệt, 08:00 – 12:00$/,
      }),
    ).toBeVisible();
    expect(
      within(table).getByRole('button', {
        name: /Thứ 7, 17\/10\/2026, Làm việc, 08:00 – 11:30$/,
      }),
    ).toBeVisible();

    // Lọc "Chờ duyệt": chỉ còn ca T3 nên giờ đồng nhất: nhãn ghi giờ, ô bỏ giờ
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: 'ChoDuyet' },
    });
    const filtered = await screen.findByRole('button', {
      name: /Thứ 3, 13\/10\/2026, Chờ duyệt$/,
    });
    expect(filtered).toHaveTextContent(/^Chờ duyệt$/);
    expect(rowHeaders(table)).toEqual(['Sáng08:00 – 12:00', 'Chiều']);

    // Bỏ lọc: các ca quay lại nên nhãn mất giờ và ô ghi giờ
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: ALL },
    });
    await screen.findByRole('button', {
      name: /Thứ 7, 17\/10\/2026, Làm việc, 08:00 – 11:30$/,
    });
    expect(rowHeaders(table)).toEqual(['Sáng', 'Chiều']);
  });

  it('DUX9-31 trang Admin Toàn hệ thống: hai bác sĩ hai chi nhánh khác giờ thì nhãn mỗi bác sĩ là giờ của CHÍNH họ; hàng không có ca chỉ chữ ca; ô trống vẫn là nút "+" của bác sĩ đúng', async () => {
    gridRows = [
      {
        ...DOCTOR_A,
        ca: [
          shift({ ngay: '2026-10-12' }),
          shift({ ngay: '2026-10-13' }),
          shift({
            ngay: '2026-10-12',
            ca: 'CaChieu',
            batDau: '13:30',
            ketThuc: '17:00',
          }),
        ],
      },
      {
        ...DOCTOR_B,
        ca: [
          shift({
            ngay: '2026-10-12',
            batDau: '07:30',
            ketThuc: '11:30',
          }),
        ],
      },
    ];
    serve('/admin/doctor-shifts');
    const onAssignCell = vi.fn();
    render(
      <MemoryRouter>
        <ScheduleBoard source="admin" allBranches onAssignCell={onAssignCell} />
      </MemoryRouter>,
    );
    const table = await screen.findByRole('table', {
      name: 'Lịch làm việc của các bác sĩ theo tuần',
    });
    expect(rowHeaders(table)).toEqual([
      'Sáng08:00 – 12:00',
      'Chiều13:30 – 17:00',
      'Sáng07:30 – 11:30',
      'Chiều',
    ]);
    // Tên chi nhánh hiện ở tiêu đề khối của từng bác sĩ (Toàn hệ thống)
    expect(within(table).getByText(BRANCH_1.ten)).toBeVisible();
    expect(within(table).getByText(BRANCH_2.ten)).toBeVisible();
    // Ô trống ở hàng Chiều (nhãn không giờ) vẫn là nút "+" của đúng bác sĩ
    const plus = within(table).getByRole('button', {
      name: `Phân công ca: ${DOCTOR_B.hoTen}, Ca chiều, Thứ 2, 12/10/2026`,
    });
    fireEvent.click(plus);
    expect(onAssignCell).toHaveBeenCalledWith(
      { bacSiId: '12', ngay: '2026-10-12', ca: 'CaChieu' },
      plus,
    );
  });
});
