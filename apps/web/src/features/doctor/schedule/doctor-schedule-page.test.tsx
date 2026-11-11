import { fireEvent, render, screen, within } from '@testing-library/react';
import { DoctorSchedulePage } from './doctor-schedule-page';
import type { DoctorSchedule, DoctorShift } from '../api/schedule-api';

// doctor F2: WL-01, WL-02, WL-03, WL-06, WL-07, WL-10 (PLAN doctor mục 7.12).
const BRANCH = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' };
const fetchMock = vi.fn<typeof fetch>();

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function shift(overrides: Partial<DoctorShift>): DoctorShift {
  return {
    lichLamViecId: '1',
    ngay: '2026-10-12',
    ca: 'CaSang',
    chiNhanh: BRANCH,
    batDau: '08:30',
    ketThuc: '11:30',
    gioCaKhongCon: false,
    nghiPhep: null,
    ...overrides,
  };
}

function schedule(ca: DoctorShift[]): DoctorSchedule {
  return {
    tuNgay: '2026-10-12',
    denNgay: '2026-10-18',
    ca,
    chiNhanhLoc: ca.length > 0 ? [BRANCH] : [],
  };
}

function lastQuery() {
  const url = String(fetchMock.mock.calls.at(-1)?.[0]);
  return new URL(url, 'http://localhost').searchParams;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Chỉ giả `Date` (hôm nay = thứ Tư 14/10/2026, giờ VN); timer thật để hook tải xong
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DoctorSchedulePage (F2)', () => {
  it('WL-01 tuần có ca: gọi đúng khoảng T2–CN, lưới đúng ô, thống kê và chi nhánh công tác', async () => {
    fetchMock.mockResolvedValueOnce(
      response(
        schedule([
          shift({ lichLamViecId: '1', ngay: '2026-10-12', ca: 'CaSang' }),
          shift({
            lichLamViecId: '2',
            ngay: '2026-10-12',
            ca: 'CaChieu',
            batDau: '13:30',
            ketThuc: '17:00',
          }),
          shift({ lichLamViecId: '3', ngay: '2026-10-14', ca: 'CaSang' }),
        ]),
      ),
    );
    render(<DoctorSchedulePage />);

    expect(
      await screen.findByRole('button', {
        name: 'Ca sáng, Thứ 2, 12/10/2026, Làm việc',
      }),
    ).toBeVisible();
    const query = lastQuery();
    expect(query.get('tuNgay')).toBe('2026-10-12');
    expect(query.get('denNgay')).toBe('2026-10-18');
    expect(screen.getByText('Tuần 12/10 – 18/10/2026')).toBeVisible();
    expect(
      screen.getByText('CLINIX Chi nhánh Quận 3', {
        selector: 'span.font-medium',
      }),
    ).toBeVisible();

    const stats = screen.getByRole('region', { name: 'Thống kê tuần' });
    expect(
      within(stats).getByText('Ca làm việc', { selector: 'p' })
        .previousElementSibling,
    ).toHaveTextContent('3');
    expect(
      within(stats).getByText('Nghỉ đã duyệt', { selector: 'p' })
        .previousElementSibling,
    ).toHaveTextContent('0');
    expect(
      within(stats).getByText('Chờ duyệt', { selector: 'p' })
        .previousElementSibling,
    ).toHaveTextContent('0');

    // Giờ của hàng lấy từ dữ liệu; ô còn lại là "Không có ca"; cột hôm nay có nhãn "Hôm nay"
    expect(
      screen.getByRole('rowheader', { name: /Sáng\s*08:30–11:30/ }),
    ).toBeVisible();
    expect(
      screen.getByRole('rowheader', { name: /Chiều\s*13:30–17:00/ }),
    ).toBeVisible();
    expect(screen.getAllByText('Không có ca')).toHaveLength(11);
    expect(screen.getByText('Hôm nay', { selector: 'span' })).toBeVisible();
  });

  it('WL-02 trạng thái nghỉ: nhãn đúng cho từng ô, thống kê tách nghỉ đã duyệt/chờ duyệt, chú giải đủ bốn mục', async () => {
    fetchMock.mockResolvedValueOnce(
      response(
        schedule([
          shift({
            lichLamViecId: '1',
            ngay: '2026-10-12',
            nghiPhep: 'DaDuyet',
          }),
          shift({
            lichLamViecId: '2',
            ngay: '2026-10-13',
            nghiPhep: 'ChoDuyet',
          }),
          shift({ lichLamViecId: '3', ngay: '2026-10-14', nghiPhep: 'TuChoi' }),
          shift({ lichLamViecId: '4', ngay: '2026-10-15' }),
        ]),
      ),
    );
    render(<DoctorSchedulePage />);

    await screen.findByRole('button', {
      name: /Thứ 2, 12\/10\/2026, Nghỉ đã duyệt/,
    });
    expect(
      screen.getByRole('button', { name: /Thứ 3, 13\/10\/2026, Chờ duyệt/ }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: /Thứ 4, 14\/10\/2026, Yêu cầu bị từ chối/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Thứ 5, 15\/10\/2026, Làm việc/ }),
    ).toBeVisible();

    const stats = screen.getByRole('region', { name: 'Thống kê tuần' });
    // 4 ca: trừ ca nghỉ đã duyệt ⇒ 3 ca làm việc; 1 nghỉ đã duyệt; 1 chờ duyệt
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
    const legend = within(screen.getByRole('list', { name: 'Chú giải' }));
    expect(
      legend.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Làm việc', 'Nghỉ đã duyệt', 'Chờ duyệt', 'Yêu cầu bị từ chối']);
  });

  it('WL-03 chuyển tuần và "Hôm nay": gọi đúng khoảng mới theo giờ VN', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response(schedule([]))));
    render(<DoctorSchedulePage />);
    await screen.findByText('Tuần 12/10 – 18/10/2026');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const today = screen.getByRole('button', { name: 'Hôm nay' });
    expect(today).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(await screen.findByText('Tuần 19/10 – 25/10/2026')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastQuery().get('tuNgay')).toBe('2026-10-19'),
    );
    expect(lastQuery().get('denNgay')).toBe('2026-10-25');
    expect(screen.queryByText('Hôm nay', { selector: 'span' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));
    expect(await screen.findByText('Tuần 05/10 – 11/10/2026')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastQuery().get('tuNgay')).toBe('2026-10-05'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    expect(await screen.findByText('Tuần 12/10 – 18/10/2026')).toBeVisible();
    await vi.waitFor(() =>
      expect(lastQuery().get('tuNgay')).toBe('2026-10-12'),
    );
  });

  it('WL-07 rỗng: báo chưa có ca, vẫn vẽ lưới "Không có ca", không gọi tên chi nhánh', async () => {
    fetchMock.mockResolvedValueOnce(response(schedule([])));
    render(<DoctorSchedulePage />);
    expect(
      await screen.findByText('Tuần này bạn chưa có ca làm việc nào.'),
    ).toBeVisible();
    expect(screen.getAllByText('Không có ca')).toHaveLength(14);
    expect(screen.queryByText(/Chi nhánh công tác/)).toBeNull();
  });

  it('WL-07 đang tải rồi lỗi: loading, hộp lỗi và "Thử lại" gọi lại thành công', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500),
      )
      .mockResolvedValueOnce(response(schedule([shift({})])));
    render(<DoctorSchedulePage />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải lịch làm việc...',
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra');
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByRole('button', { name: /Ca sáng, Thứ 2/ }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('WL-07 mất mạng: thông báo mất kết nối', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<DoctorSchedulePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng',
    );
  });

  it('WL-07 phản hồi 200 sai hình dạng: báo lỗi chung, không vỡ trang', async () => {
    fetchMock.mockResolvedValueOnce(response({ ok: true }));
    render(<DoctorSchedulePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra',
    );
    expect(
      screen.getByRole('heading', { name: 'Lịch làm việc' }),
    ).toBeVisible();
  });

  it('WL-10 không có số lịch hẹn: không hiện "lịch khám", "0 lịch" hay nút xem lịch hẹn, cả ở ô lẫn hộp chi tiết', async () => {
    fetchMock.mockResolvedValueOnce(response(schedule([shift({})])));
    render(<DoctorSchedulePage />);
    const cell = await screen.findByRole('button', { name: /Ca sáng, Thứ 2/ });
    expect(document.body.textContent).not.toMatch(
      /lịch khám|\d lịch|lịch hẹn/i,
    );

    fireEvent.click(cell);
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết ca làm việc',
    });
    expect(dialog.textContent).not.toMatch(/lịch khám|\d lịch|lịch hẹn/i);
  });

  it('WL-06 hộp "Chi tiết ca": ngày, ca + giờ, chi nhánh; Esc và "Đóng" đóng, focus về ô', async () => {
    fetchMock.mockResolvedValueOnce(response(schedule([shift({})])));
    render(<DoctorSchedulePage />);
    const cell = await screen.findByRole('button', { name: /Ca sáng, Thứ 2/ });

    fireEvent.click(cell);
    const dialog = await screen.findByRole('dialog', {
      name: 'Chi tiết ca làm việc',
    });
    expect(within(dialog).getByText('Làm việc')).toBeVisible();
    expect(within(dialog).getByText('Thứ 2, 12/10/2026')).toBeVisible();
    expect(within(dialog).getByText('Ca sáng · 08:30 – 11:30')).toBeVisible();
    expect(within(dialog).getByText('CLINIX Chi nhánh Quận 3')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cell).toHaveFocus();

    fireEvent.click(cell);
    fireEvent.click(await screen.findByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('WL-06 ca "mồ côi" (không còn giờ): hộp chi tiết báo giờ không còn hiệu lực, không bịa giờ', async () => {
    fetchMock.mockResolvedValueOnce(
      response(
        schedule([shift({ batDau: null, ketThuc: null, gioCaKhongCon: true })]),
      ),
    );
    render(<DoctorSchedulePage />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Ca sáng, Thứ 2/ }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Ca sáng · Giờ ca không còn hiệu lực'),
    ).toBeVisible();
  });
});
