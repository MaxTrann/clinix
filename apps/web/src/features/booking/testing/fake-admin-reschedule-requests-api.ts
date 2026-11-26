import type { FakeAdminScope } from './fake-admin-api';
import { jsonResponse, type FakeRequest } from './fake-appointment-list-api';
import type { FakeRequestRecord } from './fake-reschedule-requests-api';
import { createFakeRescheduleRequestsHandleApi } from './fake-reschedule-requests-handle-api';

// API giả của yêu cầu đổi lịch phía Quản trị viên cho test web (reschedule F5). BỌC API giả đọc và ghi của F4 (cùng kho, cùng hợp đồng THẬT của B8 và B9): đổi `/admin/…` thành `/reception/…` rồi lọc theo PHẠM VI như
// B8 và B9. Nên hợp đồng chung (query chặt, 404 cùng thân, mã lỗi ghi) không viết lại. KHÔNG gọi backend thật; dữ liệu giả.
//   GET /admin/me                                   `api.scope`
//   GET /public/branches                            `api.branches` (phân trang như route thật); `api.failNextBranches` đổi phản hồi lần kế tiếp
//   GET /admin/reschedule-requests                  như B8: `chiNhanhId` sai dạng ⇒ 400 `IS_BIGINT_ID` ở CẢ HAI phạm vi (DTO kiểm trước dịch vụ); Toàn hệ thống lọc theo nó (chi nhánh lạ ⇒ rỗng); Chi nhánh BỎ QUA
//                                                   nó và chỉ thấy chi nhánh được gán
//   GET /admin/reschedule-requests/:id              không có, ngoài phạm vi, id sai dạng ⇒ cùng một thân 404 `KHONG_TIM_THAY`
//   POST /admin/reschedule-requests/:id/approve|reject  như B9; ngoài phạm vi ⇒ 404 `YEU_CAU_DOI_LICH_KHONG_TON_TAI`
//   GET /public/doctors                             do bản của F4 trả (`api.inner.doctors`)
// Mọi lời gọi (đường dẫn GỐC của Quản trị viên, query, thân, có Authorization hay không) ghi vào `api.requests`. Lỗi và lời gọi treo đặt qua `api.inner.failNext`, `api.inner.failNextWrite`.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;

export interface FakeBranch {
  chiNhanhId: string;
  ten: string;
}

const LIST_PATH = '/admin/reschedule-requests';
const REQUEST_PATH = /^\/admin\/reschedule-requests(\/.*)?$/;
const BIGINT_ID = /^[1-9][0-9]*$/;

export function createFakeAdminRescheduleRequestsApi(delegate: FetchLike) {
  const inner = createFakeRescheduleRequestsHandleApi(delegate);
  const branchOverrides: Override[] = [];

  const api = {
    inner,
    scope: { phamVi: 'ToanHeThong' } as FakeAdminScope,
    // Yêu cầu của MỌI chi nhánh; phạm vi xét theo `detail.chiNhanh.id`
    records: [] as FakeRequestRecord[],
    branches: [] as FakeBranch[],
    // `total` lớn hơn số mục trả về ⇒ danh sách rút gọn; `null` ⇒ đúng bằng số mục
    branchTotal: null as number | null,
    requests: [] as FakeRequest[],

    failNextBranches(override: Override) {
      branchOverrides.push(override);
    },
    callsTo(path: string) {
      return api.requests.filter((request) => request.path === path);
    },
    // Query của các lần gọi danh sách, theo thứ tự
    listQueries() {
      return api.callsTo(LIST_PATH).map((request) => request.query);
    },
    // Mọi lời gọi tới route của Quản trị viên về yêu cầu đổi lịch (đọc và ghi)
    requestCalls() {
      return api.requests.filter((request) => REQUEST_PATH.test(request.path));
    },
    writes() {
      return api.requestCalls().filter((request) => request.method !== 'GET');
    },

    fetch: async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      const request: FakeRequest = {
        method,
        path,
        query: Object.fromEntries(url.searchParams),
        hasToken: new Headers(init?.headers).has('Authorization'),
      };
      if (typeof init?.body === 'string')
        request.body = JSON.parse(init.body) as unknown;
      api.requests.push(request);

      if (method === 'GET' && path === '/admin/me') {
        return jsonResponse(api.scope);
      }
      if (method === 'GET' && path === '/public/branches') {
        const override = branchOverrides.shift();
        if (override) return override(init);
        return jsonResponse({
          items: api.branches,
          total: api.branchTotal ?? api.branches.length,
          page: 1,
          pageSize: 100,
        });
      }
      if (!REQUEST_PATH.test(path)) return inner.fetch(input, init);

      // Chi nhánh nhìn thấy theo phạm vi, rồi (chỉ ở danh sách của Toàn hệ thống) theo bộ lọc
      const wanted = url.searchParams.getAll('chiNhanhId');
      if (path === LIST_PATH && wanted.some((id) => !BIGINT_ID.test(id))) {
        return jsonResponse(
          {
            maLoi: 'DU_LIEU_KHONG_HOP_LE',
            thongBao: 'Dữ liệu không hợp lệ.',
            loi: [{ truong: 'chiNhanhId', ma: 'IS_BIGINT_ID' }],
          },
          400,
        );
      }
      const scope = api.scope;
      const filter =
        scope.phamVi === 'ChiNhanh'
          ? scope.chiNhanh.id
          : path === LIST_PATH
            ? wanted.at(0)
            : undefined;
      inner.records = api.records.filter(
        ({ detail }) => filter === undefined || detail.chiNhanh.id === filter,
      );

      const forwarded = new URL(url);
      forwarded.pathname = forwarded.pathname.replace('/admin/', '/reception/');
      if (path === LIST_PATH) forwarded.searchParams.delete('chiNhanhId');
      return inner.fetch(forwarded.toString(), init);
    },
  };
  return api;
}

export type FakeAdminRequestsApi = ReturnType<
  typeof createFakeAdminRescheduleRequestsApi
>;
