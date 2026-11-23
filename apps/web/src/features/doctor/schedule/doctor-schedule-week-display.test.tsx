import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  withEmptyAppointments,
  withEmptyLeaveHistory,
} from '../testing/fetch-routing';
import type { DoctorSchedule, DoctorShift } from '../api/schedule-api';
import { DoctorSchedulePage } from './doctor-schedule-page';

// doctor UX8, cả trang: quy tắc "ô ghi chi nhánh khi `chiNhanhLoc` có từ 2 chi nhánh" và "giờ nhãn hàng tính trên ca đang hiển thị (đã lọc)". DUX8-30 đến 33 [đề xuất];
// phủ WL-01, WL-05. Ô ghi chi nhánh khi và chỉ khi có ô chọn "Lọc theo chi nhánh" (cùng ngưỡng `branches.length >= 2` của thanh công cụ).
const BRANCH_A = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Mẫu 1' };
const BRANCH_B = { chiNhanhId: '2', ten: 'CLINIX Chi nhánh Mẫu 2' };
const fetchMock = vi.fn<typeof fetch>();

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let counter = 0;
function shift(overrides: Partial<DoctorShift>): DoctorShift {
  counter += 1;
  return {
    lichLamViecId: String(counter),
    ngay: '2026-10-12',
    ca: 'CaSang',
    chiNhanh: BRANCH_A,
    batDau: '08:00',
    ketThuc: '12:00',
    gioCaKhongCon: false,
    nghiPhep: null,
    ...overrides,
  };
}

function schedule(
  ca: DoctorShift[],
  chiNhanhLoc: { chiNhanhId: string; ten: string }[],
  tuNgay = '2026-10-12',
  denNgay = '2026-10-18',
): DoctorSchedule {
  return { tuNgay, denNgay, ca, chiNhanhLoc };
}

const BRANCH_FILTER = { name: 'Lọc theo chi nhánh' };
const HOURS = /\d{2}:\d{2}/;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal(
    'fetch',
    withEmptyAppointments(withEmptyLeaveHistory(fetchMock)),
  );
  // Chỉ giả `Date` (hôm nay = thứ Tư 14/10/2026, giờ VN); timer thật để hook tải xong
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Lịch tuần của Bác sĩ: quy tắc chi nhánh và giờ nhãn hàng (UX8)', () => {
  it('DUX8-30 WL-01 WL-05 `chiNhanhLoc` có hai chi nhánh: ô ghi chi nhánh VÀ có ô chọn chi nhánh; lọc theo một chi nhánh ô vẫn ghi (quy tắc không đổi theo bộ lọc)', async () => {
    const body = schedule(
      [
        shift({ ngay: '2026-10-12', chiNhanh: BRANCH_A }),
        shift({ ngay: '2026-10-13', chiNhanh: BRANCH_B }),
      ],
      [BRANCH_A, BRANCH_B],
    );
    fetchMock.mockImplementation(() => Promise.resolve(response(body)));
    render(<DoctorSchedulePage />);

    const monday = await screen.findByRole('button', {
      name: /^Ca sáng, Thứ 2/,
    });
    const select = screen.getByRole('combobox', BRANCH_FILTER);
    expect(within(monday).getByText(BRANCH_A.ten)).toBeVisible();
    expect(
      within(screen.getByRole('button', { name: /^Ca sáng, Thứ 3/ })).getByText(
        BRANCH_B.ten,
      ),
    ).toBeVisible();

    // Lọc B: chỉ còn một ca nhưng ô vẫn ghi chi nhánh (không đếm chi nhánh của ca đang hiển thị)
    fireEvent.change(select, { target: { value: BRANCH_B.chiNhanhId } });
    expect(
      screen.queryByRole('button', { name: /^Ca sáng, Thứ 2/ }),
    ).toBeNull();
    expect(
      within(screen.getByRole('button', { name: /^Ca sáng, Thứ 3/ })).getByText(
        BRANCH_B.ten,
      ),
    ).toBeVisible();

    fireEvent.change(select, { target: { value: BRANCH_A.chiNhanhId } });
    expect(
      within(
        await screen.findByRole('button', { name: /^Ca sáng, Thứ 2/ }),
      ).getByText(BRANCH_A.ten),
    ).toBeVisible();
  });

  it('DUX8-31 WL-01 `chiNhanhLoc` chỉ có một chi nhánh: ô không ghi chi nhánh, không có ô chọn chi nhánh, đầu trang vẫn ghi "Chi nhánh công tác"', async () => {
    const body = schedule(
      [
        shift({ ngay: '2026-10-12' }),
        shift({ ngay: '2026-10-13', ca: 'CaChieu' }),
      ],
      [BRANCH_A],
    );
    fetchMock.mockImplementation(() => Promise.resolve(response(body)));
    render(<DoctorSchedulePage />);

    await screen.findByRole('button', { name: /^Ca sáng, Thứ 2/ });
    for (const cell of screen.getAllByRole('button', {
      name: /^Ca (sáng|chiều), Thứ/,
    }))
      expect(cell.textContent).not.toContain(BRANCH_A.ten);
    expect(screen.queryByRole('combobox', BRANCH_FILTER)).toBeNull();
    expect(
      screen.getByText(BRANCH_A.ten, { selector: 'span.font-medium' }),
    ).toBeVisible();
  });

  it('DUX8-32 WL-01 chuyển tuần: tuần có hai chi nhánh thì ô ghi, tuần kế chỉ một chi nhánh thì không ghi (quy tắc theo tuần đang xem, hành vi đã chốt)', async () => {
    const week1 = schedule(
      [
        shift({ ngay: '2026-10-12', chiNhanh: BRANCH_A }),
        shift({ ngay: '2026-10-13', chiNhanh: BRANCH_B }),
      ],
      [BRANCH_A, BRANCH_B],
    );
    const week2 = schedule(
      [shift({ ngay: '2026-10-19', chiNhanh: BRANCH_A })],
      [BRANCH_A],
      '2026-10-19',
      '2026-10-25',
    );
    fetchMock.mockImplementation((input) => {
      const from = new URL(String(input), 'http://localhost').searchParams.get(
        'tuNgay',
      );
      return Promise.resolve(response(from === '2026-10-12' ? week1 : week2));
    });
    render(<DoctorSchedulePage />);

    expect(
      within(
        await screen.findByRole('button', { name: /^Ca sáng, Thứ 2, 12\/10/ }),
      ).getByText(BRANCH_A.ten),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    const next = await screen.findByRole('button', {
      name: /^Ca sáng, Thứ 2, 19\/10/,
    });
    expect(next.textContent).not.toContain(BRANCH_A.ten);
    expect(screen.queryByRole('combobox', BRANCH_FILTER)).toBeNull();
  });

  it('DUX8-33 WL-01 WL-05 giờ nhãn hàng tính trên ca ĐANG HIỂN THỊ: lọc ra các ca đồng giờ thì nhãn ghi giờ và ô bỏ giờ; bỏ lọc thì nhãn chỉ "Sáng" và ô ghi giờ', async () => {
    const body = schedule(
      [
        shift({ ngay: '2026-10-12', batDau: '08:00', ketThuc: '12:00' }),
        shift({
          ngay: '2026-10-13',
          batDau: '08:00',
          ketThuc: '11:30',
          nghiPhep: 'ChoDuyet',
        }),
      ],
      [BRANCH_A],
    );
    fetchMock.mockImplementation(() => Promise.resolve(response(body)));
    render(<DoctorSchedulePage />);

    const monday = await screen.findByRole('button', {
      name: /^Ca sáng, Thứ 2/,
    });
    expect(screen.getByRole('rowheader', { name: /^Sáng$/ })).toBeVisible();
    expect(within(monday).getByText('08:00 – 12:00')).toBeVisible();
    expect(
      within(screen.getByRole('button', { name: /^Ca sáng, Thứ 3/ })).getByText(
        '08:00 – 11:30',
      ),
    ).toBeVisible();

    const status = screen.getByRole('combobox', {
      name: 'Lọc theo trạng thái',
    });
    fireEvent.change(status, { target: { value: 'ChoDuyet' } });
    expect(
      screen.getByRole('rowheader', { name: /^Sáng\s*08:00 – 11:30$/ }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Ca sáng, Thứ 3/ }).textContent,
    ).not.toMatch(HOURS);

    fireEvent.change(status, { target: { value: 'all' } });
    expect(screen.getByRole('rowheader', { name: /^Sáng$/ })).toBeVisible();
    expect(
      within(screen.getByRole('button', { name: /^Ca sáng, Thứ 2/ })).getByText(
        '08:00 – 12:00',
      ),
    ).toBeVisible();
  });
});
