import { APPOINTMENT_STATES } from '../appointments/common/appointment-status';
import type {
  PatientAppointment,
  StatusCounts,
} from '../appointments/patient/api/patient-appointment-types';

// API giả của "Lịch hẹn của tôi" cho test web (booking F1; F2 thêm chi tiết). Bọc `fetch` của fake auth (`src/test/fake-auth-api.ts`) như
// `fake-booking-api.ts`: CHỈ trả lời bốn đường dẫn GET dưới đây, mọi đường dẫn khác chuyển cho `delegate`. KHÔNG gọi backend thật.
//   /patient/appointments  danh sách: lọc `trangThai` (một hay nhiều mã, ngăn bằng dấu phẩy) và `q` (chứa, không phân biệt hoa thường, trên mã lịch,
//                          bác sĩ, người khám), tính `demTheoTrangThai` như B1 (áp mọi bộ lọc TRỪ trạng thái), cắt trang theo `page` và `api.pageSize`;
//                          trang vượt cuối ⇒ 200 rỗng và `total` vẫn đúng (như B1). Các bộ lọc `hoSoNguoiThanId`, `bacSiId`, `chuyenKhoaId`, `tuNgay`,
//                          `denNgay` CHỈ được ghi vào `requests` (không lọc): test khẳng định truy vấn đã gửi, không khẳng định kết quả lọc.
//   /patient/relatives, /public/specialties, /public/doctors  trả `api.relatives`, `api.specialties`, `api.doctors` (đặt thân tuỳ ý).
// Ghi MỌI lời gọi vào `requests` (kể cả đường dẫn chuyển đi), kèm query và việc có gắn Authorization hay không.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;

export type FakeRoute = 'list' | 'relatives' | 'specialties' | 'doctors';

const ROUTE_PATHS: Readonly<Record<string, FakeRoute>> = {
  '/patient/appointments': 'list',
  '/patient/relatives': 'relatives',
  '/public/specialties': 'specialties',
  '/public/doctors': 'doctors',
};

export interface FakeRequest {
  method: string;
  // Đường dẫn bỏ tiền tố `/api` và bỏ query
  path: string;
  query: Record<string, string>;
  hasToken: boolean;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Thân lỗi chuẩn của API (`maLoi`, `thongBao`, `loi`): giao diện chọn câu theo `maLoi`, không theo mã HTTP
export function apiErrorResponse(
  status: number,
  maLoi: string,
  loi?: { truong: string; ma: string }[],
): Response {
  return jsonResponse({ maLoi, thongBao: 'Lỗi giả của test', loi }, status);
}

// Một lịch hẹn mẫu: dữ liệu giả, không phải của ai (dự án chỉ dùng dữ liệu mẫu)
export function makeAppointment(
  overrides: Partial<PatientAppointment> = {},
): PatientAppointment {
  return {
    maLichHen: 'CP20261020001',
    trangThai: 'DaXacNhan',
    thoiGian: '2026-10-20T01:00:00.000Z',
    bacSi: 'Nguyễn Minh Anh',
    chuyenKhoa: 'Tim mạch',
    chiNhanh: 'CLINIX Quận 1',
    dichVu: 'Khám tim mạch',
    nguoiKham: { hoTen: 'Nguyễn Văn A', laBanThan: true },
    giaSnapshot: '300000.00',
    tienCoc: '100000.00',
    hanThanhToan: null,
    choPhepHuy: true,
    ...overrides,
  };
}

// `count` lịch hẹn có mã khác nhau (`CP20261000001`…), trạng thái xoay vòng qua sáu trạng thái, lùi dần theo ngày: đủ để dựng nhiều trang
export function makeAppointments(count: number): PatientAppointment[] {
  return Array.from({ length: count }, (_, index) =>
    makeAppointment({
      maLichHen: `CP2026100${String(index + 1).padStart(4, '0')}`,
      trangThai: APPOINTMENT_STATES[index % APPOINTMENT_STATES.length],
      thoiGian: new Date(
        Date.UTC(2026, 9, 28, 1, 0) - index * 86_400_000,
      ).toISOString(),
    }),
  );
}

const normalize = (text: string) => text.normalize('NFC').toLowerCase();

function serveList(
  query: Record<string, string>,
  rows: readonly PatientAppointment[],
  serverPageSize: number,
) {
  const needle = normalize(query.q ?? '');
  const matching = rows.filter(
    (row) =>
      needle === '' ||
      normalize(
        `${row.maLichHen} ${row.bacSi} ${row.nguoiKham.hoTen}`,
      ).includes(needle),
  );
  const states = query.trangThai ? query.trangThai.split(',') : null;
  const shown = states
    ? matching.filter((row) => states.includes(row.trangThai))
    : matching;
  const countOf = (state: string) =>
    matching.filter((row) => row.trangThai === state).length;
  const demTheoTrangThai: StatusCounts = {
    ChoThanhToan: countOf('ChoThanhToan'),
    DaXacNhan: countOf('DaXacNhan'),
    DaTiepDon: countOf('DaTiepDon'),
    HoanThanh: countOf('HoanThanh'),
    DaHuy: countOf('DaHuy'),
    VangMat: countOf('VangMat'),
  };
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || serverPageSize;
  return {
    items: shown.slice((page - 1) * pageSize, page * pageSize),
    total: shown.length,
    page,
    pageSize,
    demTheoTrangThai,
  };
}

export function createFakeAppointmentListApi(delegate: FetchLike) {
  const overrides: Record<FakeRoute, Override[]> = {
    list: [],
    relatives: [],
    specialties: [],
    doctors: [],
  };

  const api = {
    // Dữ liệu của danh sách. Kiểu `unknown[]` để test đặt cả dòng sai hình dạng hợp đồng
    appointments: [makeAppointment()] as unknown[],
    // `pageSize` mặc định của "máy chủ" khi yêu cầu không gửi `pageSize` (B1: 20); test đặt nhỏ để có nhiều trang với ít dữ liệu
    pageSize: 20,
    relatives: { items: [] } as unknown,
    specialties: { items: [], total: 0, page: 1, pageSize: 100 } as unknown,
    doctors: { items: [], total: 0, page: 1, pageSize: 100 } as unknown,
    requests: [] as FakeRequest[],

    // Lần gọi kế tiếp tới `route` dùng phản hồi này (lỗi `apiErrorResponse`, `Response` 502, ném lỗi mạng, hoặc treo)
    failNext(route: FakeRoute, override: Override) {
      overrides[route].push(override);
    },
    // Các lời gọi tới một đường dẫn (GET), theo thứ tự
    callsTo(path: string) {
      return api.requests.filter((request) => request.path === path);
    },
    // Mọi lời gọi KHÔNG phải GET (danh sách chỉ đọc: phải rỗng)
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
      };
      api.requests.push(request);

      const route = Object.hasOwn(ROUTE_PATHS, request.path)
        ? ROUTE_PATHS[request.path]
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
            api.appointments as PatientAppointment[],
            api.pageSize,
          ),
        );
      }
      return jsonResponse(api[route]);
    },
  };
  return api;
}
