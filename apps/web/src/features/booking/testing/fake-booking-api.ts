import type { EligibilityResult } from '../api/booking-types';

// API giả của booking cho test web (F3; F4 đến F7 thêm các đường dẫn của mình). Bọc `fetch` của fake auth (`src/test/fake-auth-api.ts`):
// CHỈ trả lời `GET /api/booking/eligibility`, mọi đường dẫn khác chuyển cho `delegate`. KHÔNG gọi backend thật. Ghi MỌI lời gọi vào
// `requests` (kể cả các đường dẫn chuyển đi) để test khẳng định "không giữ chỗ khi chuyển trang": không có lời gọi ghi nào tới `/booking/*`.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;

export const ELIGIBLE: EligibilityResult = {
  choPhepDatLich: true,
  soLichHenToiDaMoiHoSo: 3,
};
export const LOCKED: EligibilityResult = {
  choPhepDatLich: false,
  lyDo: 'DAT_LICH_BI_KHOA_NO_SHOW',
  soLichHenToiDaMoiHoSo: 3,
};

// Phương thức và đường dẫn (bỏ tiền tố `/api`, bỏ query) của một lời gọi `fetch`
function describeRequest(input: RequestInfo | URL, init?: RequestInit) {
  const { pathname } = new URL(String(input), 'http://localhost');
  return {
    method: init?.method ?? 'GET',
    path: pathname.replace(/^\/api/, ''),
  };
}

export function createFakeBookingApi(delegate: FetchLike) {
  const overrides: Override[] = [];

  const api = {
    // Thân 200 của `GET /booking/eligibility`; kiểu `unknown` để test đặt cả thân sai hợp đồng
    eligibility: ELIGIBLE as unknown,
    requests: [] as { method: string; path: string }[],

    // Lần gọi `eligibility` kế tiếp dùng phản hồi này (có thể ném lỗi mạng hoặc treo)
    failNext(override: Override) {
      overrides.push(override);
    },
    // Các lời gọi KHÔNG phải GET tới `/booking/*` (giữ chỗ, đặt lịch…)
    bookingWrites() {
      return api.requests.filter(
        (request) =>
          request.path.startsWith('/booking') && request.method !== 'GET',
      );
    },
    count(method: string, path: string) {
      return api.requests.filter(
        (request) => request.method === method && request.path === path,
      ).length;
    },

    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = describeRequest(input, init);
      api.requests.push(request);

      if (request.method === 'GET' && request.path === '/booking/eligibility') {
        const override = overrides.shift();
        if (override) return override(init);
        return new Response(JSON.stringify(api.eligibility), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return delegate(input, init);
    },
  };
  return api;
}
