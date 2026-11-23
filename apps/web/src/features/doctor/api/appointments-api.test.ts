import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  APPOINTMENTS_PAGE_SIZE,
  listDoctorShiftAppointments,
  listReceptionDayAppointments,
  MAX_APPOINTMENT_PAGES,
} from './appointments-api';

// doctor UX6: client riêng của doctor cho hai API lịch hẹn (WHT-10 cấm import client của booking). DUX6-70 đến DUX6-79 [đề xuất]; phủ WL-06, WL-08, WL-13 [đề xuất].
// Chỉ dữ liệu GIẢ; `fetch` giả đọc `page` từ URL như API thật (tối đa 100 dòng mỗi trang, luôn trả `total`).
const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function paramsOf(call: number): URLSearchParams {
  return new URL(String(fetchMock.mock.calls[call][0]), 'http://web.invalid')
    .searchParams;
}

const receptionRow = (index: number) => ({
  maLichHen: `CLX-20261014-${String(index).padStart(5, '0')}`,
  trangThai: 'DaXacNhan',
  thoiGian: '2026-10-14T01:00:00.000Z',
  bacSi: 'BS. Mẫu Một',
  chuyenKhoa: 'Tim mạch',
  chiNhanh: 'CLINIX Mẫu 1',
  dichVu: 'Khám mẫu',
  nguoiKham: { hoTen: `Bệnh nhân Mẫu ${index}`, laBanThan: true },
  nguoiDat: { hoTen: 'Người đặt Mẫu', soDienThoai: '0900000000' },
  giaSnapshot: '200000.00',
  tienCoc: '0.00',
});

// Trả `total` dòng giả, cắt theo `page` và `pageSize` của URL
function receptionPages(total: number) {
  fetchMock.mockImplementation((input) => {
    const params = new URL(String(input), 'http://web.invalid').searchParams;
    const page = Number(params.get('page'));
    const size = Number(params.get('pageSize'));
    const first = (page - 1) * size;
    const count = Math.max(0, Math.min(size, total - first));
    const items = Array.from({ length: count }, (_, i) =>
      receptionRow(first + i + 1),
    );
    return Promise.resolve(json({ items, total, page, pageSize: size }));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listDoctorShiftAppointments (GET /doctor/appointments)', () => {
  it('DUX6-70 gọi MỘT lần với tuNgay = denNgay, ca, sapXep=CuNhat, pageSize=100; số theo trạng thái lấy từ demTheoTrangThai', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        items: [
          {
            maLichHen: 'CLX-20261014-00002',
            thoiGian: '2026-10-14T02:00:00.000Z',
            ca: 'CaSang',
            trangThai: 'HoanThanh',
            nguoiKham: { hoTen: 'Bệnh nhân Mẫu 2', quanHe: 'BanThan' },
            dichVu: 'Khám mẫu',
          },
          {
            maLichHen: 'CLX-20261014-00001',
            thoiGian: '2026-10-14T01:00:00.000Z',
            ca: 'CaSang',
            trangThai: 'DaXacNhan',
            nguoiKham: { hoTen: 'Bệnh nhân Mẫu 1', quanHe: 'BanThan' },
            dichVu: 'Khám mẫu',
          },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
        demTheoTrangThai: { DaXacNhan: 1, HoanThanh: 1 },
      }),
    );
    const result = await listDoctorShiftAppointments({
      ngay: '2026-10-14',
      ca: 'CaSang',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const params = paramsOf(0);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/doctor/appointments',
    );
    expect(params.get('tuNgay')).toBe('2026-10-14');
    expect(params.get('denNgay')).toBe('2026-10-14');
    expect(params.get('ca')).toBe('CaSang');
    expect(params.get('sapXep')).toBe('CuNhat');
    expect(params.get('pageSize')).toBe(String(APPOINTMENTS_PAGE_SIZE));
    expect(params.get('page')).toBe('1');
    expect(result.total).toBe(2);
    expect(result.counts).toEqual({ DaXacNhan: 1, HoanThanh: 1 });
    // Sắp lại theo giờ dù server trả sai thứ tự; chỉ giữ năm trường cần
    expect(result.lines.map((line) => line.maLichHen)).toEqual([
      'CLX-20261014-00001',
      'CLX-20261014-00002',
    ]);
    expect(Object.keys(result.lines[0]).sort()).toEqual([
      'dichVu',
      'maLichHen',
      'nguoiKham',
      'thoiGian',
      'trangThai',
    ]);
  });

  it('DUX6-71 phản hồi sai hình dạng ⇒ UnexpectedResponseError (không để giao diện vỡ)', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: 'không phải mảng' }));
    await expect(
      listDoctorShiftAppointments({ ngay: '2026-10-14', ca: 'CaSang' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    fetchMock.mockResolvedValueOnce(json({ items: [], total: 0 })); // thiếu demTheoTrangThai
    await expect(
      listDoctorShiftAppointments({ ngay: '2026-10-14', ca: 'CaSang' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});

describe('listReceptionDayAppointments (GET /reception/appointments)', () => {
  it('DUX6-72 một trang (total ≤ 100): MỘT lời gọi, đúng tuNgay = denNgay, bacSiId, pageSize=100; chỉ giữ các trường cần (không người đặt, SĐT, giá)', async () => {
    receptionPages(3);
    const result = await listReceptionDayAppointments({
      day: '2026-10-14',
      bacSiId: '11',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const params = paramsOf(0);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/reception/appointments',
    );
    expect(params.get('tuNgay')).toBe('2026-10-14');
    expect(params.get('denNgay')).toBe('2026-10-14');
    expect(params.get('bacSiId')).toBe('11');
    expect(params.get('pageSize')).toBe('100');
    expect(result.lines).toHaveLength(3);
    expect(result.truncated).toBe(false);
    expect(Object.keys(result.lines[0]).sort()).toEqual([
      'bacSi',
      'chuyenKhoa',
      'dichVu',
      'maLichHen',
      'nguoiKham',
      'thoiGian',
      'trangThai',
    ]);
    const text = JSON.stringify(result);
    expect(text).not.toContain('0900000000');
    expect(text).not.toContain('Người đặt Mẫu');
    expect(text).not.toContain('200000');
  });

  it('DUX6-73 không có bacSiId thì không gửi bacSiId lên', async () => {
    receptionPages(1);
    await listReceptionDayAppointments({ day: '2026-10-14' });
    expect(paramsOf(0).has('bacSiId')).toBe(false);
  });

  it('DUX6-49 total = 230: 3 lời gọi (trang 1, 2, 3), đủ 230 dòng, đúng thứ tự trang', async () => {
    receptionPages(230);
    const result = await listReceptionDayAppointments({ day: '2026-10-14' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((call) => paramsOf(call).get('page')).sort()).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(result.lines).toHaveLength(230);
    expect(result.lines[0].nguoiKham).toBe('Bệnh nhân Mẫu 1');
    expect(result.lines[229].nguoiKham).toBe('Bệnh nhân Mẫu 230');
    expect(result.truncated).toBe(false);
    expect(result.total).toBe(230);
  });

  it('DUX6-50 biên: total = 500 đủ 5 trang; total = 501 ⇒ chỉ trang 1, truncated, không gọi thêm', async () => {
    expect(MAX_APPOINTMENT_PAGES).toBe(5);
    receptionPages(500);
    const full = await listReceptionDayAppointments({ day: '2026-10-14' });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(full.lines).toHaveLength(500);
    expect(full.truncated).toBe(false);

    fetchMock.mockReset();
    receptionPages(501);
    const over = await listReceptionDayAppointments({ day: '2026-10-14' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(over.truncated).toBe(true);
    expect(over.total).toBe(501);
  });

  it('DUX6-51 một trang lỗi ⇒ cả lời gọi lỗi (không trả số thiếu); phản hồi sai hình dạng ⇒ UnexpectedResponseError', async () => {
    fetchMock.mockImplementation((input) => {
      const page = new URL(
        String(input),
        'http://web.invalid',
      ).searchParams.get('page');
      return Promise.resolve(
        page === '2'
          ? json({ maLoi: 'LOI_HE_THONG' }, 500)
          : json({
              items: [receptionRow(1)],
              total: 150,
              page: 1,
              pageSize: 100,
            }),
      );
    });
    await expect(
      listReceptionDayAppointments({ day: '2026-10-14' }),
    ).rejects.toBeDefined();

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json({ total: 'x' }));
    await expect(
      listReceptionDayAppointments({ day: '2026-10-14' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
