import { APPOINTMENT_STATES } from '../appointments/common/appointment-status';
import type {
  ReceptionAppointment,
  ReceptionAppointmentDetail,
} from '../appointments/reception/api/reception-appointment-types';
import {
  apiErrorResponse,
  jsonResponse,
  type FakeRequest,
} from './fake-appointment-list-api';

// API giả của "Quản lý lịch hẹn" của Lễ tân cho test web (booking F8). Bọc `fetch` của fake auth như `fake-appointment-list-api.ts`: CHỈ trả lời các đường dẫn GET dưới
// đây, mọi đường dẫn khác chuyển cho `delegate`. KHÔNG gọi backend thật.
//   /reception/appointments        danh sách: lọc `trangThai` (một mã) và `q` (chứa, không phân biệt hoa thường, trên mã lịch, tên người khám, tên và SĐT người đặt, bác sĩ),
//                                  cắt trang theo `page` và `api.pageSize`; trang vượt cuối ⇒ 200 rỗng và `total` vẫn đúng (như B3); KHÔNG có `demTheoTrangThai` (như B3).
//                                  `chuyenKhoaId`, `bacSiId`, `tuNgay`, `denNgay` CHỈ được ghi vào `requests` (không lọc): test khẳng định truy vấn đã gửi.
//   /reception/appointments/:ma    chi tiết: lấy từ `api.details[ma]`; chưa đặt thì dựng từ dòng danh sách cùng mã; không có ⇒ 404 `KHONG_TIM_THAY` (như B3).
//   /public/specialties, /public/doctors  trả `api.specialties`, `api.doctors`.
//   POST /reception/appointments/:ma/status  (F9) route ghi của Lễ tân: mặc định 200 `{ maLichHen, trangThai }` (`DaHuy` thêm `hoanCoc` = `api.cancelRefund`) và ĐỔI trạng thái của
//                          lịch trong `details` và `appointments` (nên lần GET chi tiết và danh sách sau đó thấy trạng thái mới, `chuyenDuoc` rỗng); `failNext('status', …)` thay phản hồi
//                          (lỗi `apiErrorResponse`, 502, ném lỗi mạng, hay treo bằng `holdResponse`). Mã không có ⇒ 404 `KHONG_TIM_THAY` như B12. Thân đã gửi ghi vào `requests[].body`.
// Ghi MỌI lời gọi vào `requests` (kể cả đường dẫn chuyển đi), kèm query, thân (lời gọi ghi) và việc có gắn Authorization hay không.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;

export type ReceptionFakeRoute =
  'list' | 'detail' | 'specialties' | 'doctors' | 'status';

const LIST_PATH = '/reception/appointments';
const DETAIL_PREFIX = `${LIST_PATH}/`;
const STATUS_SUFFIX = '/status';
const PUBLIC_PATHS: Readonly<Record<string, 'specialties' | 'doctors'>> = {
  '/public/specialties': 'specialties',
  '/public/doctors': 'doctors',
};

// Một dòng danh sách mẫu của Lễ tân: dữ liệu giả, không phải của ai (dự án chỉ dùng dữ liệu mẫu)
export function makeReceptionAppointment(
  overrides: Partial<ReceptionAppointment> = {},
): ReceptionAppointment {
  return {
    maLichHen: 'CP20261018001',
    trangThai: 'DaXacNhan',
    thoiGian: '2026-10-18T01:00:00.000Z',
    bacSi: 'Nguyễn Minh Anh',
    chuyenKhoa: 'Tim mạch',
    chiNhanh: 'CLINIX Quận 1',
    dichVu: 'Khám tim mạch',
    nguoiKham: { hoTen: 'Nguyễn Văn A', laBanThan: true },
    giaSnapshot: '300000.00',
    tienCoc: '100000.00',
    nguoiDat: { hoTen: 'Nguyễn Văn A', soDienThoai: '0901234567' },
    ...overrides,
  };
}

// Chi tiết mẫu: lịch `DaXacNhan` còn phải thu (như bản `Noop` của `payment`), nên `chuyenDuoc` chỉ có `DaHuy`
export function makeReceptionDetail(
  overrides: Partial<ReceptionAppointmentDetail> = {},
): ReceptionAppointmentDetail {
  return {
    ...makeReceptionAppointment(),
    lyDoKham: 'Đau ngực nhẹ, theo dõi huyết áp',
    lyDoHuy: null,
    hanThanhToan: null,
    chuyenDuoc: ['DaHuy'],
    conPhaiThu: '300000.00',
    ...overrides,
  };
}

// `count` lịch hẹn có mã khác nhau (`CP20261018001`…), trạng thái xoay vòng qua sáu trạng thái: đủ để dựng nhiều trang
export function makeReceptionAppointments(
  count: number,
): ReceptionAppointment[] {
  return Array.from({ length: count }, (_, index) =>
    makeReceptionAppointment({
      maLichHen: `CP20261018${String(index + 1).padStart(3, '0')}`,
      trangThai: APPOINTMENT_STATES[index % APPOINTMENT_STATES.length],
      nguoiKham: { hoTen: `Người khám ${index + 1}`, laBanThan: true },
      nguoiDat: {
        hoTen: `Người khám ${index + 1}`,
        soDienThoai: `09000000${String(index + 1).padStart(2, '0')}`,
      },
    }),
  );
}

const normalize = (text: string) => text.normalize('NFC').toLowerCase();

function serveList(
  query: Record<string, string>,
  rows: readonly ReceptionAppointment[],
  serverPageSize: number,
) {
  const needle = normalize(query.q ?? '');
  const shown = rows.filter(
    (row) =>
      (query.trangThai === undefined || row.trangThai === query.trangThai) &&
      (needle === '' ||
        normalize(
          `${row.maLichHen} ${row.bacSi} ${row.nguoiKham.hoTen} ${row.nguoiDat.hoTen} ${row.nguoiDat.soDienThoai}`,
        ).includes(needle)),
  );
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || serverPageSize;
  return {
    items: shown.slice((page - 1) * pageSize, page * pageSize),
    total: shown.length,
    page,
    pageSize,
  };
}

export function createFakeReceptionApi(delegate: FetchLike) {
  const overrides: Record<ReceptionFakeRoute, Override[]> = {
    list: [],
    detail: [],
    specialties: [],
    doctors: [],
    status: [],
  };

  const api = {
    // Dữ liệu của danh sách. Kiểu `unknown[]` để test đặt cả dòng sai hình dạng hợp đồng
    appointments: [makeReceptionAppointment()] as unknown[],
    // Chi tiết theo mã lịch (đã chuẩn hoá chữ hoa); thiếu thì dựng từ dòng danh sách cùng mã
    details: {} as Record<string, unknown>,
    // `pageSize` mặc định của "máy chủ" khi yêu cầu không gửi `pageSize` (B3: 20); test đặt nhỏ để có nhiều trang với ít dữ liệu
    pageSize: 20,
    specialties: { items: [], total: 0, page: 1, pageSize: 100 } as unknown,
    doctors: { items: [], total: 0, page: 1, pageSize: 100 } as unknown,
    requests: [] as FakeRequest[],
    // Số hoàn THỰC TẾ mà 200 của `DaHuy` trả (chuỗi decimal; `null` = chưa thu đồng nào)
    cancelRefund: { tyLe: 100, soTien: '100000.00' } as {
      tyLe: number;
      soTien: string;
    } | null,

    // Lần gọi kế tiếp tới `route` dùng phản hồi này (lỗi `apiErrorResponse`, `Response` 502, ném lỗi mạng, hoặc treo)
    failNext(route: ReceptionFakeRoute, override: Override) {
      overrides[route].push(override);
    },
    // Các lời gọi tới một đường dẫn (GET), theo thứ tự
    callsTo(path: string) {
      return api.requests.filter((request) => request.path === path);
    },
    // Mọi lời gọi KHÔNG phải GET (lời gọi ghi)
    writes() {
      return api.requests.filter((request) => request.method !== 'GET');
    },
    // Thân của các POST tới route ghi, theo thứ tự
    statusBodies() {
      return api.writes().map((request) => request.body);
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

      if (isStatusCall(request)) return api.serveStatus(request, init);

      const route: ReceptionFakeRoute | undefined =
        request.path === LIST_PATH
          ? 'list'
          : request.path.startsWith(DETAIL_PREFIX)
            ? 'detail'
            : Object.hasOwn(PUBLIC_PATHS, request.path)
              ? PUBLIC_PATHS[request.path]
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
            api.appointments as ReceptionAppointment[],
            api.pageSize,
          ),
        );
      }
      if (route === 'detail') {
        const code = decodeURIComponent(
          request.path.slice(DETAIL_PREFIX.length),
        ).toUpperCase();
        const given = api.details[code];
        if (given !== undefined) return jsonResponse(given);
        const row = (api.appointments as ReceptionAppointment[]).find(
          (item) => item.maLichHen === code,
        );
        return row === undefined
          ? apiErrorResponse(404, 'KHONG_TIM_THAY')
          : jsonResponse(makeReceptionDetail(row));
      }
      return jsonResponse(api[route]);
    },

    // Route ghi: kết quả do `failNext('status', …)` nếu có, không thì thành công và ĐỔI trạng thái của lịch
    serveStatus(request: FakeRequest, init?: RequestInit) {
      const override = overrides.status.shift();
      if (override) return override(init);
      const code = statusCode(request.path);
      const body = request.body as { trangThai: string; lyDo?: string };
      const row = (api.appointments as ReceptionAppointment[]).find(
        (item) => item.maLichHen === code,
      );
      if (row === undefined && api.details[code] === undefined) {
        return apiErrorResponse(404, 'KHONG_TIM_THAY');
      }
      const current = (api.details[code] ??
        makeReceptionDetail(row)) as ReceptionAppointmentDetail;
      api.details[code] = {
        ...current,
        trangThai: body.trangThai,
        chuyenDuoc: [],
        conPhaiThu: null,
        ...(body.trangThai === 'DaHuy' ? { lyDoHuy: body.lyDo ?? null } : {}),
      };
      if (row !== undefined) row.trangThai = body.trangThai;
      return jsonResponse(
        body.trangThai === 'DaHuy'
          ? { maLichHen: code, trangThai: 'DaHuy', hoanCoc: api.cancelRefund }
          : { maLichHen: code, trangThai: body.trangThai },
      );
    },
  };
  return api;
}

// `POST /reception/appointments/:ma/status`: đúng một đoạn mã rồi `/status`
function isStatusCall(request: FakeRequest): boolean {
  return (
    request.method === 'POST' &&
    request.path.startsWith(DETAIL_PREFIX) &&
    request.path.endsWith(STATUS_SUFFIX) &&
    !statusCode(request.path).includes('/')
  );
}

// Mã lịch (đã giải mã, chữ hoa) từ đường dẫn của route ghi
function statusCode(path: string): string {
  return decodeURIComponent(
    path.slice(DETAIL_PREFIX.length, -STATUS_SUFFIX.length),
  ).toUpperCase();
}
