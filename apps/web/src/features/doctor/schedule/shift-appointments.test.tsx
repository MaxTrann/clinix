import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { DoctorShift } from '../api/schedule-api';
import { doctorAppointmentsHref } from '../appointments/appointment-links';
import { withEmptyLeaveHistory } from '../testing/fetch-routing';
import { DoctorSchedulePage } from './doctor-schedule-page';
import { ShiftDetailDialog } from './shift-detail-dialog';

// doctor UX6 (G1): hộp "Chi tiết ca làm việc" của Bác sĩ có mục "Lịch hẹn trong ca". DUX6-20 đến DUX6-33 [đề xuất]; phủ WL-06 và WL-13 [đề xuất] (mã mới cho
// "lịch hẹn trong ca"). Chỉ dữ liệu GIẢ (tên "Bệnh nhân Mẫu n", SĐT 0900000000); `fetch` giả mô phỏng `GET /doctor/appointments` theo hợp đồng của backend.
const BRANCH = { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' };
const fetchMock = vi.fn<typeof fetch>();

const SHIFT: DoctorShift = {
  lichLamViecId: '1',
  ngay: '2026-10-14',
  ca: 'CaSang',
  chiNhanh: BRANCH,
  batDau: '08:00',
  ketThuc: '12:00',
  gioCaKhongCon: false,
  nghiPhep: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function appointment(
  index: number,
  isoUtc: string,
  trangThai: string,
  dichVu = 'Khám chuyên khoa mẫu',
  hoTen = `Bệnh nhân Mẫu ${index}`,
) {
  return {
    maLichHen: `CLX-20261014-${String(index).padStart(5, '0')}`,
    thoiGian: isoUtc,
    ca: 'CaSang',
    trangThai,
    nguoiKham: {
      hoTen,
      quanHe: 'BanThan',
      gioiTinh: 'Nu',
      ngaySinh: '1990-05-17',
      soDienThoai: '0900000000',
    },
    dichVu,
    chuyenKhoa: 'Tim mạch',
    lyDoKham: null,
    coHoSoKham: false,
  };
}

const THREE = {
  items: [
    appointment(1, '2026-10-14T01:00:00.000Z', 'DaXacNhan'), // 08:00
    appointment(2, '2026-10-14T01:30:00.000Z', 'DaTiepDon'), // 08:30
    appointment(3, '2026-10-14T02:00:00.000Z', 'HoanThanh'), // 09:00
  ],
  total: 3,
  page: 1,
  pageSize: 100,
  demTheoTrangThai: {
    ChoThanhToan: 0,
    DaXacNhan: 1,
    DaTiepDon: 1,
    HoanThanh: 1,
    DaHuy: 0,
    VangMat: 0,
  },
};

function appointmentCalls(): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.includes('/doctor/appointments'))
    .map((url) => new URL(url, 'http://web.invalid'));
}

function openDialog(shift: DoctorShift = SHIFT) {
  const onClose = vi.fn();
  const view = render(
    <MemoryRouter>
      <ShiftDetailDialog
        shift={shift}
        returnFocusRef={{ current: null }}
        onClose={onClose}
      />
    </MemoryRouter>,
  );
  return { onClose, ...view };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Hộp "Chi tiết ca làm việc": mục "Lịch hẹn trong ca" (G1)', () => {
  it('DUX6-20 mở hộp gọi ĐÚNG MỘT lần với tuNgay = denNgay, ca, sapXep=CuNhat, pageSize=100; vẽ lại không gọi lại', async () => {
    fetchMock.mockResolvedValue(json(THREE));
    const { rerender } = openDialog();
    await screen.findByRole('list', { name: 'Lịch hẹn trong ca' });

    const calls = appointmentCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('tuNgay')).toBe('2026-10-14');
    expect(calls[0].searchParams.get('denNgay')).toBe('2026-10-14');
    expect(calls[0].searchParams.get('ca')).toBe('CaSang');
    expect(calls[0].searchParams.get('sapXep')).toBe('CuNhat');
    expect(calls[0].searchParams.get('pageSize')).toBe('100');

    rerender(
      <MemoryRouter>
        <ShiftDetailDialog
          shift={{ ...SHIFT }}
          returnFocusRef={{ current: null }}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    expect(appointmentCalls()).toHaveLength(1);
  });

  it('DUX6-21 danh sách theo giờ Việt Nam: giờ, người khám, dịch vụ và chip trạng thái CÓ CHỮ', async () => {
    fetchMock.mockResolvedValue(json(THREE));
    openDialog();
    const list = await screen.findByRole('list', { name: 'Lịch hẹn trong ca' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('08:00');
    expect(rows[0]).toHaveTextContent('Bệnh nhân Mẫu 1');
    expect(rows[0]).toHaveTextContent('Khám chuyên khoa mẫu');
    expect(rows[0]).toHaveTextContent('Đã xác nhận');
    expect(rows[1]).toHaveTextContent('08:30');
    expect(rows[1]).toHaveTextContent('Đã tiếp đón');
    expect(rows[2]).toHaveTextContent('09:00');
    expect(rows[2]).toHaveTextContent('Hoàn thành');
  });

  it('DUX6-22 tổng theo trạng thái lấy từ demTheoTrangThai, đúng thứ tự cố định', async () => {
    fetchMock.mockResolvedValue(json(THREE));
    openDialog();
    expect(
      await screen.findByText(
        '3 lịch hẹn: 1 Đã xác nhận · 1 Đã tiếp đón · 1 Hoàn thành',
      ),
    ).toBeVisible();
  });

  it('DUX6-23 ca chưa có lịch hẹn: câu rỗng, không có danh sách', async () => {
    fetchMock.mockResolvedValue(
      json({
        items: [],
        total: 0,
        page: 1,
        pageSize: 100,
        demTheoTrangThai: {},
      }),
    );
    openDialog();
    expect(await screen.findByText('Ca này chưa có lịch hẹn.')).toBeVisible();
    expect(
      screen.queryByRole('list', { name: 'Lịch hẹn trong ca' }),
    ).toBeNull();
  });

  it('DUX6-24 đang tải: phần thông tin ca và nút Đóng vẫn có, báo "Đang tải lịch hẹn trong ca…"', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    openDialog();
    expect(
      await screen.findByText('Đang tải lịch hẹn trong ca...'),
    ).toBeVisible();
    expect(screen.getByText('CLINIX Chi nhánh Quận 3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeVisible();
  });

  it('DUX6-25 lỗi: khối lỗi có "Thử lại" gọi lại, không lộ thông điệp máy chủ; thông tin ca vẫn hiện', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        { maLoi: 'LOI_HE_THONG', thongBao: 'Chi tiết nội bộ không được lộ' },
        500,
      ),
    );
    fetchMock.mockResolvedValue(json(THREE));
    openDialog();
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('Chi tiết nội bộ');
    expect(screen.getByText('CLINIX Chi nhánh Quận 3')).toBeVisible();

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByRole('list', { name: 'Lịch hẹn trong ca' }),
    ).toBeVisible();
    expect(appointmentCalls()).toHaveLength(2);
  });

  it('DUX6-26 đóng hộp khi đang tải: yêu cầu bị HUỶ (signal), kết quả muộn không ghi và không báo lỗi', async () => {
    let signal: AbortSignal | undefined;
    let resolve: (value: Response) => void = () => undefined;
    fetchMock.mockImplementation((_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((done) => {
        resolve = done;
      });
    });
    const { unmount } = openDialog();
    await waitFor(() => expect(appointmentCalls()).toHaveLength(1));
    unmount();
    expect(signal?.aborted).toBe(true);
    resolve(json(THREE));
    await Promise.resolve();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('DUX6-27 danh sách bị cắt (total > số dòng): số theo trạng thái vẫn đúng, báo "Còn N lịch hẹn nữa" kèm liên kết sang trang Lịch hẹn', async () => {
    fetchMock.mockResolvedValue(
      json({
        ...THREE,
        total: 130,
        demTheoTrangThai: { DaXacNhan: 100, HoanThanh: 29, DaHuy: 1 },
      }),
    );
    openDialog();
    expect(
      await screen.findByText(
        '129 lịch hẹn: 100 Đã xác nhận · 29 Hoàn thành · 1 Đã hủy',
      ),
    ).toBeVisible();
    expect(screen.getByText('Còn 127 lịch hẹn nữa.')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Xem tất cả trong Lịch hẹn' }),
    ).toHaveAttribute(
      'href',
      doctorAppointmentsHref({ day: '2026-10-14', ca: 'CaSang' }),
    );
  });

  it('DUX6-27b không bị cắt thì KHÔNG có "Còn … nữa" và không có liên kết', async () => {
    fetchMock.mockResolvedValue(json(THREE));
    openDialog();
    await screen.findByRole('list', { name: 'Lịch hẹn trong ca' });
    expect(screen.queryByText(/Còn \d+ lịch hẹn nữa/)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('DUX6-28 ca "Nghỉ đã duyệt" vẫn tải và hiện lịch hẹn nếu có', async () => {
    fetchMock.mockResolvedValue(json(THREE));
    openDialog({ ...SHIFT, nghiPhep: 'DaDuyet' });
    expect(
      await screen.findByRole('list', { name: 'Lịch hẹn trong ca' }),
    ).toBeVisible();
    expect(screen.getByText('Nghỉ đã duyệt')).toBeVisible();
  });

  it('DUX6-29 mất kết nối: khối lỗi có "Thử lại"; hộp vẫn đóng được', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { onClose } = openDialog();
    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('button', { name: 'Thử lại' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('DUX6-30 không hiện SĐT, ngày sinh, giới tính hay mã lịch của người khám (API có trả nhưng hộp không cần)', async () => {
    fetchMock.mockResolvedValue(json(THREE));
    openDialog();
    const list = await screen.findByRole('list', { name: 'Lịch hẹn trong ca' });
    const dialogText = screen.getByRole('dialog').textContent ?? '';
    expect(dialogText).not.toContain('0900000000');
    expect(dialogText).not.toContain('1990');
    expect(dialogText).not.toContain('CLX-');
    expect(list.textContent).not.toContain('BanThan');
  });

  it('DUX6-31 Esc đóng hộp (nền đã inert, focus bẫy trong hộp)', async () => {
    fetchMock.mockResolvedValue(json(THREE));
    const { onClose } = openDialog();
    await screen.findByRole('list', { name: 'Lịch hẹn trong ca' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('DUX6-32 ca chiều gọi ca=CaChieu và đúng ngày của ca đó', async () => {
    fetchMock.mockResolvedValue(
      json({ ...THREE, items: [], total: 0, demTheoTrangThai: {} }),
    );
    openDialog({
      ...SHIFT,
      ca: 'CaChieu',
      ngay: '2026-10-15',
      batDau: '13:00',
      ketThuc: '17:00',
    });
    await screen.findByText('Ca này chưa có lịch hẹn.');
    const [call] = appointmentCalls();
    expect(call.searchParams.get('ca')).toBe('CaChieu');
    expect(call.searchParams.get('tuNgay')).toBe('2026-10-15');
    expect(call.searchParams.get('denNgay')).toBe('2026-10-15');
  });

  it('DUX6-33 cả trang: bấm ô trong lưới tuần mở hộp và gọi ĐÚNG MỘT lần /doctor/appointments (lưới tuần thì 0 lần)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
    try {
      fetchMock.mockImplementation((input) => {
        const url = String(input);
        if (url.includes('/doctor/appointments'))
          return Promise.resolve(json(THREE));
        return Promise.resolve(
          json({
            tuNgay: '2026-10-12',
            denNgay: '2026-10-18',
            ca: [SHIFT],
            chiNhanhLoc: [BRANCH],
          }),
        );
      });
      vi.stubGlobal('fetch', withEmptyLeaveHistory(fetchMock));
      render(
        <MemoryRouter>
          <DoctorSchedulePage />
        </MemoryRouter>,
      );
      const cell = await screen.findByRole('button', {
        name: /^Ca sáng, Thứ 4, 14\/10\/2026, Làm việc/,
      });
      expect(appointmentCalls()).toHaveLength(0);
      fireEvent.click(cell);
      await screen.findByRole('list', { name: 'Lịch hẹn trong ca' });
      expect(appointmentCalls()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
