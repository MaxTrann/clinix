import type {
  AdminAppointmentDetail,
  HistoryEntry,
} from '../appointments/admin/api/admin-appointment-types';
import type { OperationsAppointment } from '../appointments/common/operations-appointment';
import {
  apiErrorResponse,
  jsonResponse,
  type FakeRequest,
} from './fake-appointment-list-api';
import {
  makeReceptionAppointment,
  makeReceptionAppointments,
} from './fake-reception-api';

// API giả của "Lịch hẹn" của Quản trị viên cho test web (booking F10). Bọc `fetch` của fake auth như `fake-reception-api.ts`: CHỈ trả lời các đường dẫn dưới đây, mọi đường dẫn khác chuyển cho
// `delegate`. KHÔNG gọi backend thật.
//   /admin/me                       phạm vi của Quản trị viên: `api.scope` (`ToanHeThong` hoặc `ChiNhanh` kèm chi nhánh).
//   /admin/appointments             danh sách: lọc `trangThai` (một mã) và `q` (chứa, không phân biệt hoa thường, trên mã lịch, bác sĩ, tên người khám, tên và SĐT người đặt), cắt trang theo
//                                   `page` và `api.pageSize`, giữ NGUYÊN thứ tự của `api.appointments` (test đặt giảm dần như B4); trang vượt cuối ⇒ 200 rỗng và `total` vẫn đúng.
//                                   `chiNhanhId`, `chuyenKhoaId`, `bacSiId`, `dichVuKhamId`, `tuNgay`, `denNgay` CHỈ được ghi vào `requests` (không lọc): test khẳng định truy vấn đã gửi.
//   /admin/appointments/:ma         chi tiết: lấy từ `api.details[ma]`; chưa đặt thì dựng từ dòng danh sách cùng mã; không có ⇒ 404 `KHONG_TIM_THAY` (như B4).
//   /public/specialties, /public/doctors, /public/branches  trả `api.specialties`, `api.doctors`, `api.branches`; /public/services trả `api.services` (`{ items }`).
//   POST /admin/appointments/:ma/override-status  route ghi (B14): mặc định 200 `{ maLichHen, trangThai }` (`DaHuy` thêm `hoanCoc` = `api.cancelRefund`) và ĐỔI trạng thái của lịch (chi tiết
//                                   và danh sách), thêm mục `OverrideLichHen` vào `lichSuTrangThai`, `chuyenDuoc` rỗng; `failNext('override', …)` thay phản hồi (lỗi `apiErrorResponse`, 502, ném
//                                   lỗi mạng, hay treo bằng `holdResponse`). Thân đã gửi ghi vào `requests[].body`.
// Ghi MỌI lời gọi vào `requests` (kể cả đường dẫn chuyển đi), kèm query, thân (lời gọi ghi) và việc có gắn Authorization hay không.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;

export type AdminFakeRoute =
  | 'list'
  | 'detail'
  | 'specialties'
  | 'doctors'
  | 'services'
  | 'branches'
  | 'override';

export type FakeAdminScope =
  | { phamVi: 'ToanHeThong' }
  | { phamVi: 'ChiNhanh'; chiNhanh: { id: string; ten: string } };

const LIST_PATH = '/admin/appointments';
const DETAIL_PREFIX = `${LIST_PATH}/`;
const OVERRIDE_SUFFIX = '/override-status';
const PUBLIC_PATHS: Readonly<
  Record<string, 'specialties' | 'doctors' | 'services' | 'branches'>
> = {
  '/public/specialties': 'specialties',
  '/public/doctors': 'doctors',
  '/public/services': 'services',
  '/public/branches': 'branches',
};

// Mốc giờ của mục lịch sử do override ghi: cố định để test khẳng định đúng giờ Việt Nam (05:00Z = 12:00)
export const FAKE_OVERRIDE_TIME = '2026-10-18T05:00:00.000Z';

// Dòng danh sách mẫu của Quản trị viên: CÙNG hình dạng dòng của Lễ tân (dữ liệu giả, không phải của ai)
export function makeAdminAppointment(
  overrides: Partial<OperationsAppointment> = {},
): OperationsAppointment {
  return makeReceptionAppointment(overrides);
}

export const makeAdminAppointments = makeReceptionAppointments;

// Một mục lịch sử mẫu
export function makeHistoryEntry(
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry {
  return {
    thoiDiem: '2026-10-17T03:00:00.000Z',
    loai: 'TaoLich',
    tuTrangThai: null,
    denTrangThai: null,
    lyDo: null,
    ...overrides,
  };
}

// Chi tiết mẫu: lịch `DaXacNhan` còn phải thu (như bản `Noop` của `payment`); `chuyenDuoc` là các đích của Quản trị viên từ `DaXacNhan` (Q24); lịch sử có đúng mục `TaoLich`
export function makeAdminDetail(
  overrides: Partial<AdminAppointmentDetail> = {},
): AdminAppointmentDetail {
  return {
    ...makeAdminAppointment(),
    lyDoKham: 'Đau ngực nhẹ, theo dõi huyết áp',
    lyDoHuy: null,
    hanThanhToan: null,
    chuyenDuoc: ['DaTiepDon', 'VangMat', 'DaHuy'],
    conPhaiThu: '300000.00',
    lichSuTrangThai: [makeHistoryEntry()],
    ...overrides,
  };
}

const normalize = (text: string) => text.normalize('NFC').toLowerCase();

function serveList(
  query: Record<string, string>,
  rows: readonly OperationsAppointment[],
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

// Mã lịch (đã giải mã, chữ hoa) từ đường dẫn chi tiết hay đường dẫn route ghi
function codeOf(path: string, suffix = ''): string {
  return decodeURIComponent(
    path.slice(DETAIL_PREFIX.length, path.length - suffix.length),
  ).toUpperCase();
}

function isOverrideCall(request: FakeRequest): boolean {
  return (
    request.method === 'POST' &&
    request.path.startsWith(DETAIL_PREFIX) &&
    request.path.endsWith(OVERRIDE_SUFFIX) &&
    !codeOf(request.path, OVERRIDE_SUFFIX).includes('/')
  );
}

export function createFakeAdminApi(delegate: FetchLike) {
  const overrides: Record<AdminFakeRoute, Override[]> = {
    list: [],
    detail: [],
    specialties: [],
    doctors: [],
    services: [],
    branches: [],
    override: [],
  };

  const api = {
    // Phạm vi của Quản trị viên đang đăng nhập (`/admin/me`)
    scope: { phamVi: 'ToanHeThong' } as FakeAdminScope,
    // Dữ liệu của danh sách. Kiểu `unknown[]` để test đặt cả dòng sai hình dạng hợp đồng
    appointments: [makeAdminAppointment()] as unknown[],
    // Chi tiết theo mã lịch (đã chuẩn hoá chữ hoa); thiếu thì dựng từ dòng danh sách cùng mã
    details: {} as Record<string, unknown>,
    // `pageSize` mặc định của "máy chủ" khi yêu cầu không gửi `pageSize` (B4: 20); test đặt nhỏ để có nhiều trang với ít dữ liệu
    pageSize: 20,
    specialties: { items: [], total: 0, page: 1, pageSize: 100 } as unknown,
    doctors: { items: [], total: 0, page: 1, pageSize: 100 } as unknown,
    branches: { items: [], total: 0, page: 1, pageSize: 100 } as unknown,
    services: { items: [] } as unknown,
    requests: [] as FakeRequest[],
    // Số hoàn THỰC TẾ mà 200 của `DaHuy` trả (chuỗi decimal; `null` = chưa thu đồng nào)
    cancelRefund: { tyLe: 100, soTien: '100000.00' } as {
      tyLe: number;
      soTien: string;
    } | null,

    // Lần gọi kế tiếp tới `route` dùng phản hồi này (lỗi `apiErrorResponse`, `Response` 502, ném lỗi mạng, hoặc treo)
    failNext(route: AdminFakeRoute, override: Override) {
      overrides[route].push(override);
    },
    // Các lời gọi tới một đường dẫn, theo thứ tự
    callsTo(path: string) {
      return api.requests.filter((request) => request.path === path);
    },
    // Mọi lời gọi KHÔNG phải GET (lời gọi ghi)
    writes() {
      return api.requests.filter((request) => request.method !== 'GET');
    },
    // Thân của các lời gọi ghi, theo thứ tự
    writeBodies() {
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

      if (request.method === 'GET' && request.path === '/admin/me') {
        return jsonResponse(api.scope);
      }
      if (isOverrideCall(request)) return api.serveOverride(request, init);

      const route: AdminFakeRoute | undefined =
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
            api.appointments as OperationsAppointment[],
            api.pageSize,
          ),
        );
      }
      if (route === 'detail') {
        const code = codeOf(request.path);
        const given = api.details[code];
        if (given !== undefined) return jsonResponse(given);
        const row = (api.appointments as OperationsAppointment[]).find(
          (item) => item.maLichHen === code,
        );
        return row === undefined
          ? apiErrorResponse(404, 'KHONG_TIM_THAY')
          : jsonResponse(makeAdminDetail(row));
      }
      return jsonResponse(api[route]);
    },

    // Route ghi: kết quả do `failNext('override', …)` nếu có, không thì thành công và ĐỔI trạng thái của lịch
    serveOverride(request: FakeRequest, init?: RequestInit) {
      const override = overrides.override.shift();
      if (override) return override(init);
      const code = codeOf(request.path, OVERRIDE_SUFFIX);
      const body = request.body as { trangThai: string; lyDo: string };
      const row = (api.appointments as OperationsAppointment[]).find(
        (item) => item.maLichHen === code,
      );
      if (row === undefined && api.details[code] === undefined) {
        return apiErrorResponse(404, 'KHONG_TIM_THAY');
      }
      const current = (api.details[code] ??
        makeAdminDetail(row)) as AdminAppointmentDetail;
      api.details[code] = {
        ...current,
        trangThai: body.trangThai,
        chuyenDuoc: [],
        conPhaiThu: null,
        ...(body.trangThai === 'DaHuy' ? { lyDoHuy: body.lyDo } : {}),
        lichSuTrangThai: [
          ...current.lichSuTrangThai,
          makeHistoryEntry({
            thoiDiem: FAKE_OVERRIDE_TIME,
            loai: 'OverrideLichHen',
            tuTrangThai: current.trangThai,
            denTrangThai: body.trangThai,
            lyDo: body.lyDo,
          }),
        ],
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
