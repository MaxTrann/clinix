import type {
  RequestDetail,
  RequestRow,
} from '../appointments/common/reschedule-requests/request-types';
import { jsonResponse, type FakeRequest } from './fake-appointment-list-api';

// API giả ĐỌC của yêu cầu đổi lịch cho test web (reschedule F4). Khớp hợp đồng THẬT của B8 (TRACKING mục 7 khối B8; `fake-reschedule-requests-api.test.ts` khoá điều đó). Bọc `fetch` của nơi khác như
// `fake-reschedule-api.ts`: CHỈ trả lời ba đường dẫn GET dưới đây, mọi đường dẫn khác chuyển cho `delegate`. KHÔNG gọi backend thật; dữ liệu giả.
//   GET /reception/reschedule-requests        danh sách của chi nhánh Lễ tân (`api.records`): query DTO CHẶT như B8 (khoá lạ, kể cả `chiNhanhId` ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`; giá trị sai ⇒ 400
//                                             `DU_LIEU_KHONG_HOP_LE` kèm `loi[]`; `q` là mã ĐẦY ĐỦ, chữ thường được chuẩn hoá, sai dạng ⇒ `MA_LICH_HEN_KHONG_HOP_LE`), trang vượt cuối ⇒ 200 rỗng mà `total`
//                                             vẫn đúng; sắp `thoiDiemTao` TĂNG chỉ khi tập trạng thái đúng `{ChoDuyet}`, mọi tập khác GIẢM (hoà thì theo id cùng chiều)
//   GET /reception/reschedule-requests/:id    chi tiết 19 khoá; "không có", "chi nhánh khác" (`api.otherBranch`) và "id sai dạng" ra CÙNG MỘT thân 404 `KHONG_TIM_THAY`
//   GET /public/doctors                       `api.doctors` (nguồn ô lọc bác sĩ; công khai, không gắn token)
// Ghi MỌI lời gọi vào `requests` (kể cả đường dẫn chuyển đi), kèm query và việc có gắn Authorization hay không. Phần GHI (duyệt, từ chối) ở `fake-reschedule-requests-handle-api.ts` (Pha B).

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;
export type RequestsRoute = 'list' | 'detail' | 'doctors';

// Một yêu cầu của kho giả: chi tiết và id bác sĩ (`bacSiId` công khai, dùng để lọc; chi tiết thật của B8 không có khoá này)
export interface FakeRequestRecord {
  detail: RequestDetail;
  bacSiId: string;
}

export const fakeRecord = (
  detail: RequestDetail,
  bacSiId = '5',
): FakeRequestRecord => ({ detail, bacSiId });

const LIST_PATH = '/reception/reschedule-requests';
const DETAIL_PATTERN = /^\/reception\/reschedule-requests\/([^/]+)$/;
const STATUSES = ['ChoDuyet', 'DaDuyet', 'TuChoi'];
const ALLOWED_KEYS = ['trangThai', 'bacSiId', 'q', 'page', 'pageSize'];
const BIGINT_ID = /^[1-9][0-9]*$/;
const CODE = /^CLX-\d{8}-[0-9A-HJKMNP-TV-Z]{5}$/;

interface Problem {
  truong: string;
  ma: string;
}

function invalidResponse(loi: Problem[]): Response {
  return jsonResponse(
    { maLoi: 'DU_LIEU_KHONG_HOP_LE', thongBao: 'Dữ liệu không hợp lệ.', loi },
    400,
  );
}

// Thân 404 DUY NHẤT của B8 cho "không có", "chi nhánh khác" và "id sai dạng" (không lộ yêu cầu có tồn tại hay không)
function notFoundResponse(): Response {
  return jsonResponse(
    { maLoi: 'KHONG_TIM_THAY', thongBao: 'Không tìm thấy dữ liệu.' },
    404,
  );
}

export function toRow(detail: RequestDetail): RequestRow {
  return {
    yeuCauId: detail.yeuCauId,
    trangThai: detail.trangThai,
    thoiDiemTao: detail.thoiDiemTao,
    maLichHen: detail.maLichHen,
    nguoiKham: detail.nguoiKham,
    bacSi: detail.bacSi,
    chiNhanh: detail.chiNhanh,
    thoiGianCu: detail.thoiGianCu,
    thoiGianMongMuon: detail.thoiGianMongMuon,
    soLanDaTuDoi: detail.soLanDaTuDoi,
  };
}

// Chuẩn hoá mã như `normalizeAppointmentCode` của máy chủ: `trim()` rồi chỉ `[a-z]` ASCII ⇒ chữ hoa
const normalizeCode = (raw: string) =>
  raw.trim().replace(/[a-z]/g, (letter) => letter.toUpperCase());

function compareIds(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function serveList(
  params: URLSearchParams,
  records: readonly FakeRequestRecord[],
): Response {
  const problems: Problem[] = [];
  for (const key of new Set(params.keys())) {
    if (!ALLOWED_KEYS.includes(key)) {
      problems.push({ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' });
    } else if (key !== 'trangThai' && params.getAll(key).length > 1) {
      problems.push({ truong: key, ma: 'TRUONG_KHONG_HOP_LE' });
    }
  }

  const rawStatuses = params.getAll('trangThai').flatMap((v) => v.split(','));
  const statuses = rawStatuses.length === 0 ? ['ChoDuyet'] : rawStatuses;
  if (statuses.some((status) => !STATUSES.includes(status))) {
    problems.push({ truong: 'trangThai', ma: 'TRANG_THAI_KHONG_HOP_LE' });
  }

  const doctor = params.get('bacSiId');
  if (doctor !== null && !BIGINT_ID.test(doctor)) {
    problems.push({ truong: 'bacSiId', ma: 'IS_BIGINT_ID' });
  }
  const rawCode = params.get('q');
  const code = rawCode === null ? null : normalizeCode(rawCode);
  if (code !== null && !CODE.test(code)) {
    problems.push({ truong: 'q', ma: 'MA_LICH_HEN_KHONG_HOP_LE' });
  }
  const rawPage = params.get('page');
  if (rawPage !== null && !BIGINT_ID.test(rawPage)) {
    problems.push({ truong: 'page', ma: 'TRUONG_KHONG_HOP_LE' });
  }
  const rawSize = params.get('pageSize');
  if (
    rawSize !== null &&
    !(BIGINT_ID.test(rawSize) && Number(rawSize) <= 100)
  ) {
    problems.push({ truong: 'pageSize', ma: 'TRUONG_KHONG_HOP_LE' });
  }
  if (problems.length > 0) return invalidResponse(problems);

  const page = rawPage === null ? 1 : Number(rawPage);
  const pageSize = rawSize === null ? 20 : Number(rawSize);
  const matching = records.filter(
    ({ detail, bacSiId }) =>
      statuses.includes(detail.trangThai) &&
      (doctor === null || bacSiId === doctor) &&
      (code === null || detail.maLichHen === code),
  );
  // Tăng (cũ nhất trước) CHỈ khi tập trạng thái đúng {ChoDuyet}; mọi tập khác giảm. Hoà thì theo id cùng chiều.
  const ascending = new Set(statuses).size === 1 && statuses[0] === 'ChoDuyet';
  const direction = ascending ? 1 : -1;
  const sorted = [...matching].sort(
    (left, right) =>
      direction *
      (left.detail.thoiDiemTao.localeCompare(right.detail.thoiDiemTao) ||
        compareIds(left.detail.yeuCauId, right.detail.yeuCauId)),
  );
  return jsonResponse({
    items: sorted
      .slice((page - 1) * pageSize, page * pageSize)
      .map(({ detail }) => toRow(detail)),
    total: sorted.length,
    page,
    pageSize,
  });
}

export function createFakeRescheduleRequestsApi(delegate: FetchLike) {
  const overrides: Record<RequestsRoute, Override[]> = {
    list: [],
    detail: [],
    doctors: [],
  };

  const api = {
    // Yêu cầu của chi nhánh Lễ tân (danh sách và chi tiết thấy được)
    records: [] as FakeRequestRecord[],
    // Yêu cầu của chi nhánh KHÁC: không có trong danh sách, chi tiết ra 404 cùng thân
    otherBranch: [] as FakeRequestRecord[],
    // Thân thô cho MỘT id (test đặt thân sai hợp đồng); thắng `records`
    detailBodies: {} as Record<string, unknown>,
    // Thân thô cho danh sách (test đặt thân sai hợp đồng); `null` ⇒ dùng `records`
    listBody: null as unknown,
    doctors: { items: [], total: 0, page: 1, pageSize: 100 } as unknown,
    requests: [] as FakeRequest[],

    // Lần gọi kế tiếp tới `route` dùng phản hồi này (lỗi, `Response` 502, ném lỗi mạng, hay một Promise treo cho tới khi test cho chạy tiếp)
    failNext(route: RequestsRoute, override: Override) {
      overrides[route].push(override);
    },
    // Các lời gọi tới một đường dẫn (GET), theo thứ tự
    callsTo(path: string) {
      return api.requests.filter((request) => request.path === path);
    },
    // Mọi lời gọi KHÔNG phải GET (Pha A chỉ đọc: phải rỗng)
    writes() {
      return api.requests.filter((request) => request.method !== 'GET');
    },

    fetch: async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(input), 'http://localhost');
      const request: FakeRequest = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, ''),
        query: Object.fromEntries(url.searchParams),
        hasToken: new Headers(init?.headers).has('Authorization'),
      };
      api.requests.push(request);
      if (request.method !== 'GET') return delegate(input, init);

      if (request.path === '/public/doctors') {
        const override = overrides.doctors.shift();
        return override ? override(init) : jsonResponse(api.doctors);
      }
      if (request.path === LIST_PATH) {
        const override = overrides.list.shift();
        if (override) return override(init);
        if (api.listBody !== null) return jsonResponse(api.listBody);
        return serveList(url.searchParams, api.records);
      }
      const match = DETAIL_PATTERN.exec(request.path);
      if (match !== null) {
        const override = overrides.detail.shift();
        if (override) return override(init);
        const id = decodeURIComponent(match[1]);
        if (Object.hasOwn(api.detailBodies, id)) {
          return jsonResponse(api.detailBodies[id]);
        }
        const found = BIGINT_ID.test(id)
          ? api.records.find(({ detail }) => detail.yeuCauId === id)
          : undefined;
        return found === undefined
          ? notFoundResponse()
          : jsonResponse(found.detail);
      }
      return delegate(input, init);
    },
  };
  return api;
}
