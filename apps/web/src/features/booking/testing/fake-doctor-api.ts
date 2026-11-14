import type {
  DoctorAppointment,
  DoctorAppointmentDetail,
} from '../appointments/doctor/api/doctor-appointment-types';
import { APPOINTMENT_STATES } from '../appointments/common/appointment-status';
import type { StatusCounts } from '../appointments/common/status-counts';
import {
  apiErrorResponse,
  jsonResponse,
  type FakeRequest,
} from './fake-appointment-list-api';

// API giả của "Lịch hẹn" của Bác sĩ cho test web (booking F11). Bọc `fetch` của fake auth như `fake-admin-api.ts`: CHỈ trả lời các đường dẫn dưới đây, mọi đường dẫn khác chuyển cho `delegate`. KHÔNG gọi backend thật.
//   /doctor/appointments        danh sách: lọc `trangThai` (một mã), `ca` và `q` (chứa, không phân biệt hoa thường, trên mã lịch, tên và SĐT người khám: như B5, không khớp tên bác sĩ), cắt trang theo `page` và
//                               `api.pageSize`, giữ NGUYÊN thứ tự của `api.appointments` (test đặt đúng thứ tự mà máy chủ sắp: web không được sắp lại); trang vượt cuối ⇒ 200 rỗng và `total` vẫn đúng.
//                               `demTheoTrangThai`: đếm theo mọi bộ lọc TRỪ `trangThai` (như B5) trừ khi test đặt `api.counts` (số cố định, để khẳng định web lấy NGUYÊN số của máy chủ).
//                               `tuNgay`, `denNgay`, `sapXep` CHỈ được ghi vào `requests` (không lọc, không sắp): test khẳng định truy vấn đã gửi.
//   /doctor/appointments/:ma    chi tiết: lấy từ `api.details[ma]`; chưa đặt thì dựng từ dòng danh sách cùng mã; không có ⇒ 404 `KHONG_TIM_THAY` (như B5).
// Ghi MỌI lời gọi vào `requests` (kể cả đường dẫn chuyển đi), kèm query và việc có gắn Authorization hay không.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;

export type DoctorFakeRoute = 'list' | 'detail';

const LIST_PATH = '/doctor/appointments';
const DETAIL_PREFIX = `${LIST_PATH}/`;

// 08:00 ngày 18/10/2026 (Chủ nhật) giờ Việt Nam
export const FAKE_VISIT_TIME = '2026-10-18T01:00:00.000Z';
export const DOCTOR_CODE = 'CP20261018001';

// Dòng danh sách mẫu của Bác sĩ: ĐÚNG tám khoá của B5 (dữ liệu giả, không phải của ai)
export function makeDoctorAppointment(
  overrides: Partial<DoctorAppointment> = {},
): DoctorAppointment {
  return {
    maLichHen: DOCTOR_CODE,
    thoiGian: FAKE_VISIT_TIME,
    ca: 'CaSang',
    trangThai: 'DaXacNhan',
    nguoiKham: {
      hoTen: 'Nguyễn Văn A',
      quanHe: 'BanThan',
      gioiTinh: 'Nam',
      ngaySinh: '1990-05-15',
      soDienThoai: '0901234567',
    },
    dichVu: 'Khám Tim mạch',
    chuyenKhoa: 'Tim mạch',
    lyDoKham: 'Đau ngực nhẹ, theo dõi huyết áp',
    ...overrides,
  };
}

// `count` dòng có mã khác nhau `CP20261018001`, `CP20261018002`… (cùng người khám, cùng giờ)
export function makeDoctorAppointments(count: number): DoctorAppointment[] {
  return Array.from({ length: count }, (_, index) =>
    makeDoctorAppointment({
      maLichHen: `CP20261018${String(index + 1).padStart(3, '0')}`,
    }),
  );
}

// Chi tiết mẫu: ĐÚNG mười một khoá (tám khoá của dòng, `ghiChuKham` luôn `null`, `chiNhanh`, `ngayDat`)
export function makeDoctorDetail(
  overrides: Partial<DoctorAppointmentDetail> = {},
): DoctorAppointmentDetail {
  return {
    ...makeDoctorAppointment(),
    ghiChuKham: null,
    chiNhanh: 'CLINIX Chi nhánh Quận 3',
    ngayDat: '2026-10-16T03:00:00.000Z',
    ...overrides,
  };
}

const normalize = (text: string) => text.normalize('NFC').toLowerCase();

function matches(
  row: DoctorAppointment,
  query: Record<string, string>,
  withStatus: boolean,
): boolean {
  const needle = normalize(query.q ?? '');
  return (
    (!withStatus ||
      query.trangThai === undefined ||
      row.trangThai === query.trangThai) &&
    (query.ca === undefined || row.ca === query.ca) &&
    (needle === '' ||
      normalize(
        `${row.maLichHen} ${row.nguoiKham.hoTen} ${row.nguoiKham.soDienThoai ?? ''}`,
      ).includes(needle))
  );
}

function serveList(
  query: Record<string, string>,
  rows: readonly DoctorAppointment[],
  serverPageSize: number,
  fixedCounts: StatusCounts | null,
) {
  const shown = rows.filter((row) => matches(row, query, true));
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || serverPageSize;
  const counts = Object.fromEntries(
    APPOINTMENT_STATES.map((state) => [state, 0]),
  ) as StatusCounts;
  for (const row of rows.filter((item) => matches(item, query, false))) {
    if (row.trangThai in counts)
      counts[row.trangThai as keyof StatusCounts] += 1;
  }
  return {
    items: shown.slice((page - 1) * pageSize, page * pageSize),
    total: shown.length,
    page,
    pageSize,
    demTheoTrangThai: fixedCounts ?? counts,
  };
}

// Mã lịch (đã giải mã, chữ hoa) từ đường dẫn chi tiết
const codeOf = (path: string) =>
  decodeURIComponent(path.slice(DETAIL_PREFIX.length)).toUpperCase();

export function createFakeDoctorApi(delegate: FetchLike) {
  const overrides: Record<DoctorFakeRoute, Override[]> = {
    list: [],
    detail: [],
  };

  const api = {
    // Dữ liệu của danh sách. Kiểu `unknown[]` để test đặt cả dòng sai hình dạng hợp đồng
    appointments: [makeDoctorAppointment()] as unknown[],
    // Chi tiết theo mã lịch (đã chuẩn hoá chữ hoa); thiếu thì dựng từ dòng danh sách cùng mã
    details: {} as Record<string, unknown>,
    // `pageSize` mặc định của "máy chủ" khi yêu cầu không gửi `pageSize` (B5: 20); test đặt nhỏ để có nhiều trang với ít dữ liệu
    pageSize: 20,
    // Số đếm cố định thay cho số tính theo dữ liệu (`null` = tính như B5)
    counts: null as StatusCounts | null,
    requests: [] as FakeRequest[],

    // Lần gọi kế tiếp tới `route` dùng phản hồi này (lỗi `apiErrorResponse`, `Response` 502, ném lỗi mạng, hoặc treo)
    failNext(route: DoctorFakeRoute, override: Override) {
      overrides[route].push(override);
    },
    // Các lời gọi tới một đường dẫn, theo thứ tự
    callsTo(path: string) {
      return api.requests.filter((request) => request.path === path);
    },
    // Mọi lời gọi KHÔNG phải GET (F11 chỉ đọc: phải luôn rỗng)
    writes() {
      return api.requests.filter((request) => request.method !== 'GET');
    },

    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const request: FakeRequest = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, ''),
        query: Object.fromEntries(url.searchParams),
        hasToken: new Headers(init?.headers).has('Authorization'),
        ...(typeof init?.body === 'string'
          ? { body: JSON.parse(init.body) as unknown }
          : {}),
      };
      api.requests.push(request);

      const route: DoctorFakeRoute | undefined =
        request.path === LIST_PATH
          ? 'list'
          : request.path.startsWith(DETAIL_PREFIX)
            ? 'detail'
            : undefined;
      if (request.method !== 'GET' || route === undefined) {
        return delegate(input, init);
      }
      const override = overrides[route].shift();
      if (override) return override(init);

      if (route === 'list') {
        return jsonResponse(
          serveList(
            request.query,
            api.appointments as DoctorAppointment[],
            api.pageSize,
            api.counts,
          ),
        );
      }
      const code = codeOf(request.path);
      const given = api.details[code];
      if (given !== undefined) return jsonResponse(given);
      const row = (api.appointments as DoctorAppointment[]).find(
        (item) => item.maLichHen === code,
      );
      return row === undefined
        ? apiErrorResponse(404, 'KHONG_TIM_THAY')
        : jsonResponse(makeDoctorDetail(row));
    },
  };
  return api;
}
