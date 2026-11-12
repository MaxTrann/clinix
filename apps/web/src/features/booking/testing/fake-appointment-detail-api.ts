import type { PatientAppointmentDetail } from '../appointments/patient/api/patient-appointment-types';
import { jsonResponse, makeAppointment } from './fake-appointment-list-api';

// API giả của chi tiết và huỷ lịch hẹn cho test web (booking F2). Bọc `fetch` của fake auth như `fake-appointment-list-api.ts`: CHỈ trả lời ba đường dẫn của
// Bệnh nhân dưới đây, mọi đường dẫn khác chuyển cho `delegate` (thành 404 "không có trong API giả" nếu không ai nhận). KHÔNG gọi backend thật.
//   GET  /patient/appointments/:maLichHen                chi tiết  ⇒ `api.detail` (`null` ⇒ 404 `KHONG_TIM_THAY`, cùng thân mọi lý do không xem được)
//   GET  /patient/appointments/:maLichHen/cancel-preview xem trước ⇒ `api.preview`
//   POST /patient/appointments/:maLichHen/cancel         huỷ       ⇒ `api.cancelResult`
// Ghi MỌI lời gọi vào `requests` (kể cả đường dẫn chuyển đi) kèm thân gửi lên, để test khẳng định "đúng một POST", "0 lời gọi sau khi Giữ lịch", "không có `lyDo`".

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;

export type DetailRoute = 'detail' | 'preview' | 'cancel';

export interface DetailFakeRequest {
  method: string;
  // Đường dẫn bỏ tiền tố `/api` và bỏ query
  path: string;
  hasToken: boolean;
  // Thân gửi lên (chuỗi JSON) hoặc `null` khi không có thân
  body: string | null;
}

// Một chi tiết mẫu (dữ liệu giả, không phải của ai): lịch `DaXacNhan` cọc 100.000đ, chưa có payment và wallet
export function makeDetail(
  overrides: Partial<PatientAppointmentDetail> = {},
): PatientAppointmentDetail {
  return {
    ...makeAppointment(),
    lyDoKham: 'Đau ngực nhẹ, theo dõi huyết áp',
    thanhToan: null,
    hoanTien: null,
    thoiGianMayChu: '2026-10-18T02:00:00.000Z',
    ...overrides,
  };
}

// 404 `KHONG_TIM_THAY`: thân CỐ ĐỊNH, vì backend trả cùng một thân cho "không có", "của người khác", `DaDoiLich`, mã sai dạng (QB-01)
export function notFoundResponse(
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse(
    { maLoi: 'KHONG_TIM_THAY', thongBao: 'Không tìm thấy.', ...extra },
    404,
  );
}

// 409 `LICH_HEN_KHONG_CHO_HUY` kèm `chiTiet.trangThai` (B10); `chiTiet` đặt tuỳ ý để thử thân thiếu hay sai hình
export function conflictResponse(chiTiet?: unknown): Response {
  return jsonResponse(
    {
      maLoi: 'LICH_HEN_KHONG_CHO_HUY',
      thongBao: 'Lỗi giả của test',
      ...(chiTiet === undefined ? {} : { chiTiet }),
    },
    409,
  );
}

// Mô tả một lời gọi `fetch` để ghi vào `requests` (đường dẫn bỏ `/api`, có token hay không, thân gửi lên)
function describeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): DetailFakeRequest {
  const { pathname } = new URL(String(input), 'http://localhost');
  return {
    method: init?.method ?? 'GET',
    path: pathname.replace(/^\/api/, ''),
    hasToken: new Headers(init?.headers).has('Authorization'),
    body: typeof init?.body === 'string' ? init.body : null,
  };
}

const ROUTE_PATTERN =
  /^\/patient\/appointments\/([^/]+?)(\/cancel-preview|\/cancel)?$/;

export function createFakeAppointmentDetailApi(delegate: FetchLike) {
  const overrides: Record<DetailRoute, Override[]> = {
    detail: [],
    preview: [],
    cancel: [],
  };

  const api = {
    // Thân 200 của chi tiết; `null` ⇒ 404. Kiểu `unknown` để test đặt cả thân sai hợp đồng
    detail: makeDetail() as unknown,
    // Mặc định: còn huỷ được, chưa thu đồng nào ("Không hoàn")
    preview: { choPhepHuy: true, hoanCoc: null } as unknown,
    cancelResult: {
      maLichHen: 'CP20261020001',
      trangThai: 'DaHuy',
      hoanCoc: null,
    } as unknown,
    requests: [] as DetailFakeRequest[],

    // Lần gọi kế tiếp tới `route` dùng phản hồi này (lỗi, `Response` 502, ném lỗi mạng, hay một Promise treo cho tới khi test cho chạy tiếp)
    failNext(route: DetailRoute, override: Override) {
      overrides[route].push(override);
    },
    // Các lời gọi theo phương thức và đường dẫn
    callsTo(method: string, path: string) {
      return api.requests.filter(
        (request) => request.method === method && request.path === path,
      );
    },
    // Mọi lời gọi KHÔNG phải GET (xem chi tiết và xem trước chỉ đọc: phải rỗng cho tới khi bấm `Xác nhận hủy`)
    writes() {
      return api.requests.filter(({ method }) => method !== 'GET');
    },

    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = describeRequest(input, init);
      api.requests.push(request);

      const match = ROUTE_PATTERN.exec(request.path);
      let route: DetailRoute | null = null;
      if (match !== null) {
        if (match[2] === undefined && request.method === 'GET')
          route = 'detail';
        if (match[2] === '/cancel-preview' && request.method === 'GET') {
          route = 'preview';
        }
        if (match[2] === '/cancel' && request.method === 'POST') {
          route = 'cancel';
        }
      }
      if (route === null) return delegate(input, init);

      const override = overrides[route].shift();
      if (override) return override(init);
      if (route === 'detail') {
        return api.detail === null
          ? notFoundResponse()
          : jsonResponse(api.detail);
      }
      return jsonResponse(route === 'preview' ? api.preview : api.cancelResult);
    },
  };
  return api;
}
