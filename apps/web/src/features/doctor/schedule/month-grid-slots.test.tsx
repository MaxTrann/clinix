import { fireEvent, render, screen, within } from '@testing-library/react';
import { DoctorSchedulePage } from './doctor-schedule-page';
import {
  withEmptyAppointments,
  withEmptyLeaveHistory,
} from '../testing/fetch-routing';
import type { DoctorSchedule, DoctorShift } from '../api/schedule-api';

// DUX3-01 đến DUX3-11 (doctor UX3, G3; WL-04, WL-05, WL-06): lưới tháng giữ VỊ TRÍ ca khi lọc. Mỗi ngày có ca vẽ đúng hai `<li>` theo thứ tự ca (sáng rồi chiều);
// ca không có (không phân công, hoặc bị lọc mất) là `<li aria-hidden>` giữ chỗ, nên chip ca chiều không nhảy lên chỗ ca sáng. Vị trí nằm trong cấu trúc DOM
// (chỉ số `<li>`), test được ở happy-dom; số đo thật (toạ độ, chiều cao) do trình duyệt đo (DUX3-50 đến 58).
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

const AFTERNOON = { ca: 'CaChieu', batDau: '13:30', ketThuc: '17:00' } as const;

// Tháng 10/2026, hôm nay 14/10 (thứ Tư). Mỗi ngày một tình huống:
const OCTOBER: DoctorShift[] = [
  // 12/10 (thứ 2): đủ hai ca, cùng chi nhánh A, đều làm việc
  shift({ lichLamViecId: '1', ngay: '2026-10-12', ca: 'CaSang' }),
  shift({ lichLamViecId: '2', ngay: '2026-10-12', ...AFTERNOON }),
  // 13/10 (thứ 3): sáng làm việc, chiều chờ duyệt
  shift({ lichLamViecId: '3', ngay: '2026-10-13', ca: 'CaSang' }),
  shift({
    lichLamViecId: '4',
    ngay: '2026-10-13',
    ...AFTERNOON,
    nghiPhep: 'ChoDuyet',
  }),
  // 14/10 (thứ 4): CHỈ có ca chiều
  shift({ lichLamViecId: '5', ngay: '2026-10-14', ...AFTERNOON }),
  // 15/10 (thứ 5): sáng ở chi nhánh A, chiều ở chi nhánh B
  shift({ lichLamViecId: '6', ngay: '2026-10-15', ca: 'CaSang' }),
  shift({
    lichLamViecId: '7',
    ngay: '2026-10-15',
    ...AFTERNOON,
    chiNhanh: BRANCH_B,
  }),
];

function schedule(ca: DoctorShift[]): DoctorSchedule {
  return { tuNgay: '', denNgay: '', ca, chiNhanhLoc: [BRANCH_A, BRANCH_B] };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal(
    'fetch',
    withEmptyAppointments(withEmptyLeaveHistory(fetchMock)),
  );
  // Hôm nay = thứ Tư 14/10/2026 giờ VN; chỉ giả `Date`, timer thật
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
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

const MON_MORNING = 'Ca sáng, Thứ 2, 12/10/2026, Làm việc';
const MON_AFTERNOON = 'Ca chiều, Thứ 2, 12/10/2026, Làm việc';
const TUE_AFTERNOON = 'Ca chiều, Thứ 3, 13/10/2026, Chờ duyệt';
const WED_AFTERNOON = 'Ca chiều, Thứ 4, 14/10/2026, Làm việc';
const THU_MORNING = 'Ca sáng, Thứ 5, 15/10/2026, Làm việc';
const THU_AFTERNOON = 'Ca chiều, Thứ 5, 15/10/2026, Làm việc';

async function openMonth() {
  render(<DoctorSchedulePage />);
  await screen.findByText('Tuần 12/10 – 18/10/2026');
  fireEvent.click(screen.getByRole('button', { name: 'Tháng' }));
  await screen.findByText('Tháng 10 năm 2026');
  return screen.findByRole('table', { name: 'Lịch làm việc theo tháng' });
}

function filter(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

// Chỗ của một chip trong ô ngày: chỉ số `<li>` trong `<ul>` của ngày và tổng số `<li>`
function slotOf(button: HTMLElement) {
  const item = button.closest('li');
  const list = item?.parentElement;
  if (!item || !list) throw new Error('Chip không nằm trong <li> của ngày');
  return {
    index: Array.from(list.children).indexOf(item),
    count: list.children.length,
    list,
  };
}

// `<li>` ở `index` là chỗ giữ chỗ: ẩn với công nghệ hỗ trợ, không nút, không chữ
function expectPlaceholder(list: Element, index: number) {
  const item = list.children[index];
  expect(item, `không có <li> số ${index}`).toBeDefined();
  expect(item).toHaveAttribute('aria-hidden', 'true');
  expect(
    within(item as HTMLElement).queryByRole('button', { hidden: true }),
  ).toBeNull();
  expect((item?.textContent ?? '').trim()).toBe('');
}

describe('DUX3-01 đến DUX3-10 lưới tháng giữ vị trí ca (G3)', () => {
  it('DUX3-01 WL-04 không lọc, ngày đủ hai ca: `<li>` 0 là ca sáng, `<li>` 1 là ca chiều, cả hai là nút thật', async () => {
    const grid = await openMonth();
    const morning = slotOf(
      within(grid).getByRole('button', { name: MON_MORNING }),
    );
    const afternoon = slotOf(
      within(grid).getByRole('button', { name: MON_AFTERNOON }),
    );

    expect(morning).toMatchObject({ index: 0, count: 2 });
    expect(afternoon).toMatchObject({ index: 1, count: 2 });
    expect(morning.list).toBe(afternoon.list);
    expect(morning.list).not.toHaveAttribute('aria-hidden');
    expect(
      within(morning.list as HTMLElement).getAllByRole('button'),
    ).toHaveLength(2);
  });

  it('DUX3-02 WL-05 lọc "Ca chiều": chip chiều VẪN ở `<li>` 1 (không nhảy lên chỗ ca sáng), `<li>` 0 là chỗ giữ chỗ, `<ul>` vẫn đủ hai `<li>`', async () => {
    const grid = await openMonth();
    filter('Lọc theo ca', 'CaChieu');

    expect(
      within(grid).queryByRole('button', { name: MON_MORNING }),
    ).toBeNull();
    const afternoon = slotOf(
      within(grid).getByRole('button', { name: MON_AFTERNOON }),
    );
    expect(afternoon).toMatchObject({ index: 1, count: 2 });
    expectPlaceholder(afternoon.list, 0);
  });

  it('DUX3-03 WL-05 lọc "Ca sáng": chip sáng ở `<li>` 0, `<li>` 1 là chỗ giữ chỗ', async () => {
    const grid = await openMonth();
    filter('Lọc theo ca', 'CaSang');

    const morning = slotOf(
      within(grid).getByRole('button', { name: MON_MORNING }),
    );
    expect(morning).toMatchObject({ index: 0, count: 2 });
    expectPlaceholder(morning.list, 1);
  });

  it('DUX3-04 WL-05 lọc trạng thái "Chờ duyệt" (sáng Làm việc bị lọc mất, chiều Chờ duyệt còn): chiều ở `<li>` 1', async () => {
    const grid = await openMonth();
    filter('Lọc theo trạng thái', 'ChoDuyet');

    expect(
      within(grid).queryByRole('button', {
        name: 'Ca sáng, Thứ 3, 13/10/2026, Làm việc',
      }),
    ).toBeNull();
    const afternoon = slotOf(
      within(grid).getByRole('button', { name: TUE_AFTERNOON }),
    );
    expect(afternoon).toMatchObject({ index: 1, count: 2 });
    expectPlaceholder(afternoon.list, 0);
  });

  it('DUX3-05 WL-05 lọc chi nhánh B (sáng ở A bị lọc mất, chiều ở B còn): chiều ở `<li>` 1', async () => {
    const grid = await openMonth();
    filter('Lọc theo chi nhánh', BRANCH_B.chiNhanhId);

    expect(
      within(grid).queryByRole('button', { name: THU_MORNING }),
    ).toBeNull();
    const afternoon = slotOf(
      within(grid).getByRole('button', { name: THU_AFTERNOON }),
    );
    expect(afternoon).toMatchObject({ index: 1, count: 2 });
    expectPlaceholder(afternoon.list, 0);
  });

  it('DUX3-06 WL-04 ngày CHỈ có ca chiều (không lọc): chiều ở `<li>` 1 và `<li>` 0 giữ chỗ, giống hệt khi lọc "Ca chiều"', async () => {
    const grid = await openMonth();
    const afternoon = slotOf(
      within(grid).getByRole('button', { name: WED_AFTERNOON }),
    );
    expect(afternoon).toMatchObject({ index: 1, count: 2 });
    expectPlaceholder(afternoon.list, 0);
  });

  it('DUX3-07 WL-05 mọi ca bị lọc hết: ngày chỉ còn "—" (không có ca), không `<ul>`, không nút; số "—" bằng số ngày của tháng (31)', async () => {
    const grid = await openMonth();
    filter('Lọc theo trạng thái', 'TuChoi');

    expect(within(grid).queryAllByRole('list')).toHaveLength(0);
    expect(
      within(grid).queryAllByRole('button', { name: /Ca (sáng|chiều)/ }),
    ).toHaveLength(0);
    expect(within(grid).getAllByLabelText('Không có ca')).toHaveLength(31);
  });

  it('DUX3-08 WL-05 đổi lọc đi và về ("Tất cả", "Ca chiều", "Tất cả"): chỉ số `<li>` của mỗi chip không đổi (sáng 0, chiều 1)', async () => {
    const grid = await openMonth();
    const indexes = () => ({
      morning: slotOf(within(grid).getByRole('button', { name: MON_MORNING }))
        .index,
      afternoon: slotOf(
        within(grid).getByRole('button', { name: MON_AFTERNOON }),
      ).index,
    });
    const before = indexes();

    filter('Lọc theo ca', 'CaChieu');
    expect(
      slotOf(within(grid).getByRole('button', { name: MON_AFTERNOON })).index,
    ).toBe(before.afternoon);

    filter('Lọc theo ca', 'all');
    expect(indexes()).toEqual(before);
    expect(before).toEqual({ morning: 0, afternoon: 1 });
  });

  it('DUX3-09 WL-04 chỗ giữ chỗ không lộ cho công nghệ hỗ trợ: trong ô ngày, số nút và số `listitem` đọc được đúng bằng số ca thật (1), dù `<ul>` có 2 `<li>`', async () => {
    const grid = await openMonth();
    const cell = within(grid)
      .getByRole('button', { name: WED_AFTERNOON })
      .closest('td');
    if (!cell) throw new Error('Không thấy ô ngày 14/10');

    expect(within(cell).getAllByRole('button')).toHaveLength(1);
    expect(within(cell).getAllByRole('listitem')).toHaveLength(1);
    expect(
      within(cell).getAllByRole('listitem', { hidden: true }),
    ).toHaveLength(2);
  });

  it('DUX3-12 WL-04 chỗ giữ chỗ GIỮ chiều cao: nội dung là một khoảng trắng không ngắt (không rỗng), để `<li>` cao đúng bằng chip khi chỉ còn một ca; chiều cao thật do trình duyệt đo (DUX3-50 đến 58)', async () => {
    const grid = await openMonth();
    const afternoon = slotOf(
      within(grid).getByRole('button', { name: WED_AFTERNOON }),
    );

    // `String.fromCharCode(160)` thay cho ký tự NBSP thô (ESLint `no-irregular-whitespace`)
    expect(afternoon.list.children[0]?.textContent).toBe(
      String.fromCharCode(160),
    );
  });

  it('DUX3-10 WL-06 sau khi lọc, bấm chip chiều mở "Chi tiết ca làm việc" đúng ca (13:30 – 17:00); Esc trả focus về chip', async () => {
    const grid = await openMonth();
    filter('Lọc theo ca', 'CaChieu');
    const chip = within(grid).getByRole('button', { name: MON_AFTERNOON });

    fireEvent.click(chip);
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết ca làm việc',
    });
    expect(within(dialog).getByText('Thứ 2, 12/10/2026')).toBeVisible();
    expect(within(dialog).getByText('Ca chiều · 13:30 – 17:00')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(chip).toHaveFocus();
  });
});

describe('DUX3-11 đối chứng: lưới tuần vốn đã giữ hàng Sáng và Chiều', () => {
  it('DUX3-11 WL-05 lọc "Ca chiều" ở lưới tuần: ô sáng thứ 2 là "Không có ca", chip chiều ở hàng Chiều (lưới tuần không đổi)', async () => {
    render(<DoctorSchedulePage />);
    await screen.findByRole('button', { name: MON_AFTERNOON });
    filter('Lọc theo ca', 'CaChieu');

    const table = screen.getByRole('table', {
      name: 'Lịch làm việc theo tuần',
    });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const morningRow = within(rows[1] as HTMLElement).getAllByRole('cell');
    const afternoonRow = within(rows[2] as HTMLElement).getAllByRole('cell');
    expect(morningRow).toHaveLength(7);
    expect(
      within(morningRow[0] as HTMLElement).getByText('Không có ca'),
    ).toBeVisible();
    expect(
      within(afternoonRow[0] as HTMLElement).getByRole('button', {
        name: MON_AFTERNOON,
      }),
    ).toBeVisible();
  });
});
