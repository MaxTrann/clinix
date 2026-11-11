import { fireEvent, render, screen, within } from '@testing-library/react';
import { DoctorSchedulePage } from './doctor-schedule-page';
import { withEmptyLeaveHistory } from '../testing/fetch-routing';
import type { DoctorSchedule, DoctorShift } from '../api/schedule-api';

// doctor F3: WL-04 (lưới tháng), WL-05 (lọc ca/trạng thái/chi nhánh), WL-06 (chi tiết ca từ chip), WL-03 (Hôm nay), WL-11 (biên tháng).
const BRANCH_A = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' };
const BRANCH_B = { chiNhanhId: '2', ten: 'CLINIX Chi nhánh Thủ Đức' };
const fetchMock = vi.fn<typeof fetch>();

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function shift(overrides: Partial<DoctorShift>): DoctorShift {
  return {
    lichLamViecId: '1',
    ngay: '2026-10-12',
    ca: 'CaSang',
    chiNhanh: BRANCH_A,
    batDau: '08:30',
    ketThuc: '11:30',
    gioCaKhongCon: false,
    nghiPhep: null,
    ...overrides,
  };
}

function schedule(ca: DoctorShift[], branches = [BRANCH_A]): DoctorSchedule {
  return { tuNgay: '', denNgay: '', ca, chiNhanhLoc: branches };
}

function query() {
  const url = String(fetchMock.mock.calls.at(-1)?.[0]);
  return new URL(url, 'http://localhost').searchParams;
}

async function openMonth() {
  render(<DoctorSchedulePage />);
  await screen.findByText('Tuần 12/10 – 18/10/2026');
  fireEvent.click(screen.getByRole('button', { name: 'Tháng' }));
  return screen.findByText('Tháng 10 năm 2026');
}

const OCTOBER = [
  shift({ lichLamViecId: '1', ngay: '2026-10-12', ca: 'CaSang' }),
  shift({ lichLamViecId: '2', ngay: '2026-10-12', ca: 'CaChieu' }),
  shift({
    lichLamViecId: '3',
    ngay: '2026-10-13',
    ca: 'CaSang',
    nghiPhep: 'DaDuyet',
  }),
  shift({
    lichLamViecId: '4',
    ngay: '2026-10-14',
    ca: 'CaChieu',
    nghiPhep: 'ChoDuyet',
  }),
  // Ngày 1/11 thuộc lưới (tuần cuối) nhưng KHÔNG thuộc tháng 10: không vẽ, không đếm
  shift({ lichLamViecId: '5', ngay: '2026-11-01', ca: 'CaSang' }),
];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', withEmptyLeaveHistory(fetchMock));
  // Hôm nay = thứ Tư 14/10/2026 giờ VN; chỉ giả `Date`, timer thật
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
  // Như API thật: chỉ trả ca nằm trong khoảng được hỏi
  fetchMock.mockImplementation((input) => {
    const params = new URL(String(input), 'http://localhost').searchParams;
    const from = params.get('tuNgay') ?? '';
    const to = params.get('denNgay') ?? '';
    return Promise.resolve(
      response(schedule(OCTOBER.filter((s) => s.ngay >= from && s.ngay <= to))),
    );
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('chế độ tháng (F3)', () => {
  it('WL-04 bấm "Tháng": gọi cả lưới 28/9 – 1/11 (≤ 42 ngày), chip "S/C · trạng thái" đúng ngày, "—" cho ngày không ca, hôm nay có dấu', async () => {
    await openMonth();
    await vi.waitFor(() => expect(query().get('tuNgay')).toBe('2026-09-28'));
    expect(query().get('denNgay')).toBe('2026-11-01');

    const grid = await screen.findByRole('table', {
      name: 'Lịch làm việc theo tháng',
    });
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN']);
    expect(within(grid).getAllByRole('row')).toHaveLength(1 + 5);
    expect(
      within(grid).getByRole('button', {
        name: 'Ca sáng, Thứ 2, 12/10/2026, Làm việc',
      }),
    ).toHaveTextContent('S · Làm việc');
    expect(
      within(grid).getByRole('button', {
        name: 'Ca chiều, Thứ 2, 12/10/2026, Làm việc',
      }),
    ).toHaveTextContent('C · Làm việc');
    expect(
      within(grid).getByRole('button', {
        name: /Thứ 3, 13\/10\/2026, Nghỉ đã duyệt/,
      }),
    ).toHaveTextContent('S · Nghỉ đã duyệt');
    expect(
      within(grid).getByRole('button', {
        name: /Thứ 4, 14\/10\/2026, Chờ duyệt/,
      }),
    ).toHaveTextContent('C · Chờ duyệt');
    // 31 ngày của tháng 10, 3 ngày có ca ⇒ 28 ô "—"; ngày 28–30/9 và 1/11 để trống
    expect(within(grid).getAllByLabelText('Không có ca')).toHaveLength(28);
    expect(
      within(grid).queryByRole('button', { name: /01\/11\/2026|1\/11\/2026/ }),
    ).toBeNull();
    expect(within(grid).getByText('(hôm nay)')).toBeInTheDocument();
  });

  it('WL-04 thống kê chỉ đếm ca thuộc tháng đang xem', async () => {
    await openMonth();
    const stats = await screen.findByRole('region', { name: 'Thống kê tuần' });
    // Trong tháng 10: 4 ca, trừ 1 nghỉ đã duyệt ⇒ 3 ca làm việc; ca ngày 1/11 bị bỏ
    expect(
      within(stats).getByText('Ca làm việc', { selector: 'p' })
        .previousElementSibling,
    ).toHaveTextContent('3');
    expect(
      within(stats).getByText('Nghỉ đã duyệt', { selector: 'p' })
        .previousElementSibling,
    ).toHaveTextContent('1');
    expect(
      within(stats).getByText('Chờ duyệt', { selector: 'p' })
        .previousElementSibling,
    ).toHaveTextContent('1');
  });

  it('WL-11 chuyển tháng: tháng 11 tải 26/10 – 6/12 (đúng 42 ngày); lùi hai lần về tháng 9; "Hôm nay" về tháng hiện tại', async () => {
    await openMonth();
    const today = screen.getByRole('button', { name: 'Hôm nay' });
    expect(today).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Tháng sau' }));
    expect(await screen.findByText('Tháng 11 năm 2026')).toBeVisible();
    await vi.waitFor(() => expect(query().get('tuNgay')).toBe('2026-10-26'));
    expect(query().get('denNgay')).toBe('2026-12-06');
    // Ca ngày 1/11 (ngoài lưới tháng 10) giờ là ca của tháng 11
    expect(
      await screen.findByRole('button', {
        name: 'Ca sáng, CN, 01/11/2026, Làm việc',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hôm nay' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Tháng trước' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tháng trước' }));
    expect(await screen.findByText('Tháng 9 năm 2026')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    expect(await screen.findByText('Tháng 10 năm 2026')).toBeVisible();
  });

  it('đổi Tháng ⇄ Tuần giữ ngày đang xem; nút chế độ báo aria-pressed', async () => {
    await openMonth();
    expect(screen.getByRole('button', { name: 'Tháng' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tuần' }));
    expect(await screen.findByText('Tuần 12/10 – 18/10/2026')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tuần' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('WL-06 bấm chip ở lưới tháng: mở "Chi tiết ca làm việc" đúng ngày, ca, chi nhánh; Esc trả focus về chip', async () => {
    await openMonth();
    const chip = await screen.findByRole('button', {
      name: 'Ca sáng, Thứ 2, 12/10/2026, Làm việc',
    });
    fireEvent.click(chip);
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết ca làm việc',
    });
    expect(within(dialog).getByText('Thứ 2, 12/10/2026')).toBeVisible();
    expect(within(dialog).getByText('Ca sáng · 08:30 – 11:30')).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(chip).toHaveFocus();
  });
});

describe('bộ lọc (F3)', () => {
  it('WL-05 lọc trạng thái: chỉ ô khớp, thống kê tính trên phần đã lọc; chọn lại "Tất cả" trả đủ', async () => {
    render(<DoctorSchedulePage />);
    await screen.findByRole('button', {
      name: /Thứ 2, 12\/10\/2026, Ca sáng|Ca sáng, Thứ 2/,
    });
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: 'ChoDuyet' },
    });

    expect(screen.getAllByRole('button', { name: /Chờ duyệt$/ })).toHaveLength(
      1,
    );
    expect(
      screen.queryByRole('button', { name: /Thứ 2, 12\/10\/2026/ }),
    ).toBeNull();
    const stats = screen.getByRole('region', { name: 'Thống kê tuần' });
    expect(
      within(stats).getByText('Ca làm việc', { selector: 'p' })
        .previousElementSibling,
    ).toHaveTextContent('1');

    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: 'all' },
    });
    expect(
      screen.getAllByRole('button', { name: /Ca (sáng|chiều), Thứ/ }),
    ).toHaveLength(4);
  });

  it('WL-05 lọc ca: Ca sáng ⇒ chỉ ca sáng, hàng Chiều trống; kết hợp với trạng thái', async () => {
    render(<DoctorSchedulePage />);
    await screen.findByRole('button', { name: /Ca sáng, Thứ 2/ });
    fireEvent.change(screen.getByLabelText('Lọc theo ca'), {
      target: { value: 'CaSang' },
    });
    expect(screen.queryByRole('button', { name: /Ca chiều/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Ca sáng/ })).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: 'DaDuyet' },
    });
    expect(screen.getAllByRole('button', { name: /Ca sáng/ })).toHaveLength(1);
  });

  it('WL-05 lọc không khớp ca nào: báo "Không có ca nào khớp với bộ lọc", vẫn có lưới', async () => {
    render(<DoctorSchedulePage />);
    await screen.findByRole('button', { name: /Ca sáng, Thứ 2/ });
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: 'TuChoi' },
    });
    expect(screen.getByText('Không có ca nào khớp với bộ lọc.')).toBeVisible();
    expect(screen.getAllByText('Không có ca')).toHaveLength(14);
  });

  it('WL-05 lọc chi nhánh: chỉ hiện khi có ca ở từ hai chi nhánh; chọn thì chỉ giữ ca của chi nhánh đó', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        response(
          schedule(
            [
              shift({
                lichLamViecId: '1',
                ngay: '2026-10-12',
                chiNhanh: BRANCH_A,
              }),
              shift({
                lichLamViecId: '2',
                ngay: '2026-10-13',
                chiNhanh: BRANCH_B,
              }),
            ],
            [BRANCH_A, BRANCH_B],
          ),
        ),
      ),
    );
    render(<DoctorSchedulePage />);
    await screen.findByRole('button', { name: /Thứ 2, 12\/10\/2026/ });
    expect(
      screen.getByText('CLINIX Chi nhánh Quận 3, CLINIX Chi nhánh Thủ Đức'),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('Lọc theo chi nhánh'), {
      target: { value: '2' },
    });
    expect(
      screen.queryByRole('button', { name: /Thứ 2, 12\/10\/2026/ }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: /Thứ 3, 13\/10\/2026/ }),
    ).toBeVisible();
  });

  it('WL-05 một chi nhánh: không có ô lọc chi nhánh', async () => {
    render(<DoctorSchedulePage />);
    await screen.findByRole('button', { name: /Ca sáng, Thứ 2/ });
    expect(screen.queryByLabelText('Lọc theo chi nhánh')).toBeNull();
  });

  it('WL-05 bộ lọc giữ nguyên khi chuyển tuần', async () => {
    render(<DoctorSchedulePage />);
    await screen.findByRole('button', { name: /Ca sáng, Thứ 2/ });
    fireEvent.change(screen.getByLabelText('Lọc theo ca'), {
      target: { value: 'CaChieu' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    await screen.findByText('Tuần 19/10 – 25/10/2026');
    expect(screen.getByLabelText('Lọc theo ca')).toHaveValue('CaChieu');
  });
});
