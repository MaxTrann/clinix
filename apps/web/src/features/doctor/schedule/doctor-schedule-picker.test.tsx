import { fireEvent, render, screen, within } from '@testing-library/react';
import { formatWeekdayDate } from '../../../shared/schedule/week';
import { withEmptyLeaveHistory } from '../testing/fetch-routing';
import { DoctorSchedulePage } from './doctor-schedule-page';

// doctor UX5 (G2), cả trang "Lịch làm việc" của Bác sĩ: hộp chọn tuần/tháng từ nhãn kỳ. Mã DUX5-nn [đề xuất]; WL-03 = chuyển tuần và "Hôm nay", WL-11 = biên tuần
// (chủ nhật, đổi tháng/năm, giờ VN), WL-12 [đề xuất] = hộp chọn kỳ. Hôm nay mặc định = thứ Tư 14/10/2026 10:00 giờ VN (chỉ giả `Date`, timer thật).
// `fetch` giả mô phỏng ĐÚNG trần của API (schedule-view.rules.ts): hai ngày hợp lệ, denNgay >= tuNgay, tối đa 42 ngày; sai thì 400 KHOANG_NGAY_KHONG_HOP_LE.

const MAX_DAYS = 42;
const fetchMock = vi.fn<typeof fetch>();
// Mã trạng thái API giả đã trả cho từng lời gọi lịch
let answers: number[] = [];

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function dayNumber(iso: string): number {
  return (
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
    ) / 86_400_000
  );
}

function rangeAccepted(from: string, to: string): boolean {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return (
    iso.test(from) &&
    iso.test(to) &&
    to >= from &&
    dayNumber(to) - dayNumber(from) + 1 <= MAX_DAYS
  );
}

function fakeApi(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input), 'http://localhost');
  const from = url.searchParams.get('tuNgay') ?? '';
  const to = url.searchParams.get('denNgay') ?? '';
  if (!rangeAccepted(from, to)) {
    answers.push(400);
    return Promise.resolve(
      response(
        {
          maLoi: 'KHOANG_NGAY_KHONG_HOP_LE',
          thongBao: 'Khoảng ngày không hợp lệ.',
        },
        400,
      ),
    );
  }
  answers.push(200);
  return Promise.resolve(
    response({ tuNgay: from, denNgay: to, ca: [], chiNhanhLoc: [] }),
  );
}

// Các khoảng đã gửi tới GET /doctor/schedule (lịch sử yêu cầu nghỉ do `withEmptyLeaveHistory` trả riêng, không vào `fetchMock`)
function ranges() {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((url) => url.pathname.endsWith('/doctor/schedule'))
    .map((url) => ({
      tuNgay: url.searchParams.get('tuNgay'),
      denNgay: url.searchParams.get('denNgay'),
    }));
}

const lastRange = () => ranges().at(-1);

beforeEach(() => {
  answers = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(fakeApi);
  vi.stubGlobal('fetch', withEmptyLeaveHistory(fetchMock));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const trigger = () =>
  screen.getByRole('button', { name: /mở hộp chọn/, hidden: true });
const dialog = () => screen.getByRole('dialog');
const cell = (iso: string) =>
  within(dialog()).getByRole('gridcell', { name: formatWeekdayDate(iso) });
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
const repeat = (times: number, key: string, init: KeyboardEventInit = {}) => {
  for (let index = 0; index < times; index += 1) press(key, init);
};

async function renderPage() {
  render(<DoctorSchedulePage />);
  await screen.findByText('Tuần 12/10 – 18/10/2026');
}

function open() {
  fireEvent.click(trigger());
  return dialog();
}

describe('chọn tuần từ nhãn kỳ (WL-03, WL-11, WL-12)', () => {
  it('DUX5-40 chọn thứ Năm 29/10/2026 ra tuần vắt tháng 26/10 – 01/11/2026: gọi đúng khoảng, hộp đóng, focus về nhãn', async () => {
    await renderPage();

    open();
    fireEvent.click(cell('2026-10-29'));

    expect(await screen.findByText('Tuần 26/10 – 01/11/2026')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastRange()).toEqual({
        tuNgay: '2026-10-26',
        denNgay: '2026-11-01',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAccessibleName(
      'Tuần 26/10 – 01/11/2026, mở hộp chọn tuần',
    );
  });

  it('DUX5-41 chọn Chủ nhật 25/10/2026 ra tuần 19/10 – 25/10/2026 (Chủ nhật thuộc tuần TRƯỚC, không nhảy sang tuần sau)', async () => {
    await renderPage();

    open();
    fireEvent.click(cell('2026-10-25'));

    expect(await screen.findByText('Tuần 19/10 – 25/10/2026')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastRange()).toEqual({
        tuNgay: '2026-10-19',
        denNgay: '2026-10-25',
      }),
    );
  });

  it('DUX5-42 tuần vắt qua năm: 01/01/2027 (thứ Sáu) ra "Tuần 28/12 – 03/01/2027", khoảng 28/12/2026 – 03/01/2027', async () => {
    await renderPage();

    open();
    for (let month = 0; month < 3; month += 1) {
      fireEvent.click(
        within(dialog()).getByRole('button', { name: 'Xem tháng sau' }),
      );
    }
    fireEvent.click(cell('2027-01-01'));

    expect(await screen.findByText('Tuần 28/12 – 03/01/2027')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastRange()).toEqual({
        tuNgay: '2026-12-28',
        denNgay: '2027-01-03',
      }),
    );
  });

  it('DUX5-44 WL-03 sau khi nhảy, ‹ › và "Hôm nay" vẫn đúng: Tuần sau ra 02/11 – 08/11, "Hôm nay" bật rồi bấm về tuần hiện tại và mờ lại', async () => {
    await renderPage();
    const today = () => screen.getByRole('button', { name: 'Hôm nay' });
    expect(today()).toBeDisabled();

    open();
    fireEvent.click(cell('2026-10-29'));
    await screen.findByText('Tuần 26/10 – 01/11/2026');
    expect(today()).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(await screen.findByText('Tuần 02/11 – 08/11/2026')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));
    expect(await screen.findByText('Tuần 19/10 – 25/10/2026')).toBeVisible();

    fireEvent.click(today());
    expect(await screen.findByText('Tuần 12/10 – 18/10/2026')).toBeVisible();
    expect(today()).toBeDisabled();
  });
});

describe('chọn tháng từ nhãn kỳ (WL-03, WL-12)', () => {
  it('DUX5-43 chọn "Tháng 3 năm 2027" (qua năm) ra đúng nhãn và khoảng lưới 01/03 – 04/04/2027 (35 ngày); chọn "Tháng 11 năm 2026" ra lưới đúng 42 ngày vẫn được API nhận', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Tháng' }));
    expect(await screen.findByText('Tháng 10 năm 2026')).toBeVisible();

    open();
    expect(dialog()).toHaveAccessibleName('Chọn tháng');
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Xem năm sau' }),
    );
    fireEvent.click(
      within(dialog()).getByRole('gridcell', { name: 'Tháng 3 năm 2027' }),
    );

    expect(await screen.findByText('Tháng 3 năm 2027')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastRange()).toEqual({
        tuNgay: '2027-03-01',
        denNgay: '2027-04-04',
      }),
    );
    expect(
      screen.getByRole('table', { name: 'Lịch làm việc theo tháng' }),
    ).toBeInTheDocument();

    // Tháng 11/2026: 26/10 … 06/12 = đúng 42 ngày, sát trần của API
    open();
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Xem năm trước' }),
    );
    fireEvent.click(
      within(dialog()).getByRole('gridcell', { name: 'Tháng 11 năm 2026' }),
    );
    expect(await screen.findByText('Tháng 11 năm 2026')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastRange()).toEqual({
        tuNgay: '2026-10-26',
        denNgay: '2026-12-06',
      }),
    );
    await vi.waitFor(() =>
      expect(screen.getByRole('table', { name: 'Lịch làm việc theo tháng' })),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(answers.every((status) => status === 200)).toBe(true);
  });

  it('DUX5-45 đổi Tuần sang Tháng giữ ngày đã chọn: chọn 05/03/2027 ở Tuần rồi bấm "Tháng" ra "Tháng 3 năm 2027"', async () => {
    await renderPage();

    open();
    for (let month = 0; month < 5; month += 1) {
      fireEvent.click(
        within(dialog()).getByRole('button', { name: 'Xem tháng sau' }),
      );
    }
    fireEvent.click(cell('2027-03-05'));
    expect(await screen.findByText('Tuần 01/03 – 07/03/2027')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Tháng' }));
    expect(await screen.findByText('Tháng 3 năm 2027')).toBeVisible();
    expect(trigger()).toHaveAccessibleName(
      'Tháng 3 năm 2027, mở hộp chọn tháng',
    );
  });
});

describe('vùng đọc và khoảng gửi cho API', () => {
  it('DUX5-46 vùng đọc aria-live "Đang xem: …" đổi theo kỳ, không role status, và chữ nhãn chỉ xuất hiện MỘT lần', async () => {
    await renderPage();
    const live = screen.getByText('Đang xem: Tuần 12/10 – 18/10/2026');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).not.toHaveAttribute('role');
    expect(screen.getAllByText('Tuần 12/10 – 18/10/2026')).toHaveLength(1);

    open();
    fireEvent.click(cell('2026-10-29'));

    expect(
      await screen.findByText('Đang xem: Tuần 26/10 – 01/11/2026'),
    ).toHaveAttribute('aria-live', 'polite');
    expect(screen.getAllByText('Tuần 26/10 – 01/11/2026')).toHaveLength(1);
    expect(screen.queryByText('Đang xem: Tuần 12/10 – 18/10/2026')).toBeNull();
  });

  it('DUX5-47 WL-11 các ca biên (01/01/2000, 31/12/2099, tháng 02/2028 nhuận, 31/12/2026): mọi lời gọi hợp lệ (7 hoặc ≤ 42 ngày), 0 phản hồi 400, không hiện thẻ lỗi', async () => {
    await renderPage();

    // Biên dưới bằng phím: Shift+PageUp 26 lần (2026 về 2000), PageUp 9 lần (về tháng 01), ↑ hai lần kẹp về 01/01/2000
    open();
    repeat(26, 'PageUp', { shiftKey: true });
    repeat(9, 'PageUp');
    repeat(2, 'ArrowUp');
    expect(cell('2000-01-01')).toHaveFocus();
    press('Enter');
    expect(await screen.findByText('Tuần 27/12 – 02/01/2000')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastRange()).toEqual({
        tuNgay: '1999-12-27',
        denNgay: '2000-01-02',
      }),
    );

    // Biên trên: Shift+PageDown 99 lần (2000 sang 2099), PageDown 11 lần (về tháng 12), ↓ năm lần kẹp về 31/12/2099
    open();
    repeat(99, 'PageDown', { shiftKey: true });
    repeat(11, 'PageDown');
    repeat(5, 'ArrowDown');
    expect(cell('2099-12-31')).toHaveFocus();
    press('Enter');
    expect(await screen.findByText('Tuần 28/12 – 03/01/2100')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastRange()).toEqual({
        tuNgay: '2099-12-28',
        denNgay: '2100-01-03',
      }),
    );

    // Chế độ Tháng, tháng 02/2028 (năm nhuận): PageUp 71 lần (về 12/2028), ← mười lần
    fireEvent.click(screen.getByRole('button', { name: 'Tháng' }));
    await screen.findByText('Tháng 12 năm 2099');
    open();
    repeat(71, 'PageUp');
    repeat(10, 'ArrowLeft');
    expect(
      within(dialog()).getByRole('gridcell', { name: 'Tháng 2 năm 2028' }),
    ).toHaveFocus();
    press('Enter');
    expect(await screen.findByText('Tháng 2 năm 2028')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastRange()).toEqual({
        tuNgay: '2028-01-31',
        denNgay: '2028-03-05',
      }),
    );

    // Mọi lời gọi (gồm cả lời gọi đầu và các lần bị huỷ khi đổi kỳ) đều hợp lệ với quy tắc của API, và API giả không trả 400 lần nào
    const sent = ranges();
    expect(sent.length).toBeGreaterThanOrEqual(4);
    for (const { tuNgay, denNgay } of sent) {
      expect(
        rangeAccepted(tuNgay ?? '', denNgay ?? ''),
        `${tuNgay} … ${denNgay}`,
      ).toBe(true);
    }
    expect(answers.every((status) => status === 200)).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  }, 60_000);

  it('DUX5-47 31/12/2026 (thứ Năm, cuối năm): tuần 28/12 – 03/01/2027, khoảng 7 ngày, không lỗi', async () => {
    await renderPage();

    // 14/10/2026 sang tháng 12 bằng PageDown hai lần rồi bấm ô 31/12
    open();
    repeat(2, 'PageDown');
    fireEvent.click(cell('2026-12-31'));

    expect(await screen.findByText('Tuần 28/12 – 03/01/2027')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastRange()).toEqual({
        tuNgay: '2026-12-28',
        denNgay: '2027-01-03',
      }),
    );
    expect(answers.every((status) => status === 200)).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('DUX5-48 WL-11 múi giờ giờ VN: 17:30 UTC ngày 22/11 là 00:30 ngày 23/11 (hôm nay 23/11); 16:30 UTC là 23:30 ngày 22/11 (hôm nay 22/11)', async () => {
    vi.setSystemTime(new Date('2026-11-22T17:30:00Z'));
    const first = render(<DoctorSchedulePage />);
    expect(await screen.findByText('Tuần 23/11 – 29/11/2026')).toBeVisible();
    open();
    expect(
      within(dialog())
        .getAllByRole('gridcell')
        .filter((element) => element.getAttribute('aria-current') === 'date')
        .map((element) => element.getAttribute('aria-label')),
    ).toEqual(['Thứ 2, 23/11/2026']);
    first.unmount();

    vi.setSystemTime(new Date('2026-11-22T16:30:00Z'));
    render(<DoctorSchedulePage />);
    expect(await screen.findByText('Tuần 16/11 – 22/11/2026')).toBeVisible();
    open();
    expect(
      within(dialog())
        .getAllByRole('gridcell')
        .filter((element) => element.getAttribute('aria-current') === 'date')
        .map((element) => element.getAttribute('aria-label')),
    ).toEqual(['CN, 22/11/2026']);
  });

  it('DUX5-49 mất mạng sau khi chọn kỳ: thẻ lỗi có "Thử lại", và thử lại tải đúng kỳ vừa chọn (không về tuần cũ)', async () => {
    await renderPage();
    await screen.findByText('Tuần này bạn chưa có ca làm việc nào.');

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    open();
    fireEvent.click(cell('2026-10-29'));

    const alert = await screen.findByRole('alert');
    expect(screen.getByText('Tuần 26/10 – 01/11/2026')).toBeVisible();
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(lastRange()).toEqual({
      tuNgay: '2026-10-26',
      denNgay: '2026-11-01',
    });
    expect(screen.getByText('Tuần 26/10 – 01/11/2026')).toBeVisible();
    expect(
      await screen.findByText('Tuần này bạn chưa có ca làm việc nào.'),
    ).toBeVisible();
  });
});
