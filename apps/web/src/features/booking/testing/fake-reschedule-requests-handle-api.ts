import type { RequestDetail } from '../appointments/common/reschedule-requests/request-types';
import { jsonResponse } from './fake-appointment-list-api';
import {
  createFakeRescheduleRequestsApi,
  type FakeRequestRecord,
} from './fake-reschedule-requests-api';

// API giả GHI của yêu cầu đổi lịch cho test web (reschedule F4 Pha B1). BỌC API giả đọc (`fake-reschedule-requests-api.ts`: cùng kho `records`, cùng `requests`) và THÊM hai đường dẫn POST theo HỢP ĐỒNG B9, ĐÃ ĐỐI CHIẾU với B9
// đã vào `main` (25/11/2026, squash `d6f0fd6`: khối "reschedule B9, cho F4, F5, X2 và D1" của TRACKING mục 7; khoá bằng `fake-reschedule-requests-handle-api.test.ts` và `request-handle-readers.ts`):
//   POST /reception/reschedule-requests/:id/approve  thân `{ ghiChu, khungGioId? }`  ⇒ 200 `{ yeuCau: { trangThai: 'DaDuyet' }, lichHenMoi: { maLichHen, thoiGian, trangThai }, thoiGianMayChu }`
//   POST /reception/reschedule-requests/:id/reject   thân `{ ghiChu }`               ⇒ 200 `{ yeuCau: { trangThai: 'TuChoi' }, thoiGianMayChu }`
// Thân kiểm CHẶT như DTO của B9: khoá lạ ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`; `ghiChu` thiếu, không phải chuỗi, rỗng sau `trim()`, quá 255 ĐƠN VỊ UTF-16, có ký tự điều khiển (trừ xuống dòng) hay giống bí mật ⇒ 400
// `loi[{ truong: 'ghiChu', ma: 'LY_DO_BAT_BUOC' }]`; `khungGioId` không phải id BIGINT dạng chuỗi (kể cả `null`) ⇒ 400 `IS_BIGINT_ID`. Thứ tự lỗi: thân sai (400) rồi id không có hay ngoài chi nhánh (404 `YEU_CAU_DOI_LICH_KHONG_TON_TAI`,
// cùng thân) rồi đã xử lý (409 `YEU_CAU_DA_XU_LY`) rồi lỗi có kiểu của lõi đổi lịch (409; yêu cầu VẪN `ChoDuyet`): duyệt khi `coTheDuyet = false` ra mã `lyDoKhongDuyet`; khung giờ mong muốn không còn trống ra
// `KHUNG_GIO_DA_DAT`, `KHUNG_GIO_DANG_GIU`, `KHUNG_GIO_DA_QUA`; khung giờ thay thế do `api.replacementError(khungGioId)` quyết (B2). Thành công ĐỔI kho (yêu cầu thành `DaDuyet`/`TuChoi`, ba khoá xử lý có giá trị) nên chi tiết và
// danh sách tải lại thấy kết quả thật. KHÔNG gọi backend thật; dữ liệu giả. Ghi từng lời gọi hợp lệ vào `approveCalls`, `rejectCalls` (thân đã `JSON.parse`).

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;
export type HandleRoute = 'approve' | 'reject';

export interface HandleCall {
  yeuCauId: string;
  body: unknown;
}

const HANDLE_PATTERN =
  /^\/reception\/reschedule-requests\/([^/]+)\/(approve|reject)$/;
const BIGINT_ID = /^[1-9][0-9]*$/;
// Mô phỏng bộ che bí mật của máy chủ (`password=…`, `token: …`, `Bearer …`)
const SECRET_LIKE = /(password|token)\s*[=:]|bearer\s+\S/i;
const CONTROL = /[^\P{Cc}\n\r]/u;

interface Problem {
  truong: string;
  ma: string;
}

const invalid = (loi: Problem[]) =>
  jsonResponse(
    { maLoi: 'DU_LIEU_KHONG_HOP_LE', thongBao: 'Dữ liệu không hợp lệ.', loi },
    400,
  );

const failure = (status: number, maLoi: string, chiTiet?: unknown) =>
  jsonResponse(
    {
      maLoi,
      thongBao: 'Lỗi giả của test',
      ...(chiTiet === undefined ? {} : { chiTiet }),
    },
    status,
  );

function validateBody(route: HandleRoute, body: unknown): Problem[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return [{ truong: 'body', ma: 'TRUONG_KHONG_DUOC_PHEP' }];
  }
  const fields = body as Record<string, unknown>;
  const allowed = route === 'approve' ? ['ghiChu', 'khungGioId'] : ['ghiChu'];
  const problems: Problem[] = Object.keys(fields)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }));
  const note = fields.ghiChu;
  const trimmed = typeof note === 'string' ? note.trim() : '';
  if (
    typeof note !== 'string' ||
    trimmed.length < 1 ||
    trimmed.length > 255 ||
    CONTROL.test(trimmed) ||
    SECRET_LIKE.test(trimmed)
  ) {
    problems.push({ truong: 'ghiChu', ma: 'LY_DO_BAT_BUOC' });
  }
  if (
    Object.hasOwn(fields, 'khungGioId') &&
    route === 'approve' &&
    !(
      typeof fields.khungGioId === 'string' && BIGINT_ID.test(fields.khungGioId)
    )
  ) {
    problems.push({ truong: 'khungGioId', ma: 'IS_BIGINT_ID' });
  }
  return problems;
}

// Mã lỗi 409 của lõi đổi lịch khi KHUNG GIỜ MONG MUỐN không còn trống (đọc từ trạng thái khung giờ đang lưu trong kho giả)
const SLOT_ERRORS = {
  DaDat: 'KHUNG_GIO_DA_DAT',
  DangGiuCho: 'KHUNG_GIO_DANG_GIU',
  HetHan: 'KHUNG_GIO_DA_QUA',
} as const;

interface HandleExtras {
  approveCalls: HandleCall[];
  rejectCalls: HandleCall[];
  // Giờ của máy chủ trong phản hồi và dấu thời gian xử lý; mã lịch mới của `DaDuyet`
  serverTime: string;
  newAppointmentCode: string;
  // Lỗi 409 của khung giờ THAY THẾ (B2): trả mã lỗi hoặc `null` nếu dùng được
  replacementError: (khungGioId: string) => string | null;
  onHandle: ((route: HandleRoute, call: HandleCall) => void) | null;
  // Lần gọi kế tiếp tới `route` ghi dùng phản hồi này (lỗi, `Response` 502, ném lỗi mạng, hay một Promise treo cho tới khi test cho chạy tiếp); chạy TRƯỚC mọi kiểm tra
  failNextWrite: (route: HandleRoute, override: Override) => void;
}

type BaseApi = ReturnType<typeof createFakeRescheduleRequestsApi>;

export function createFakeRescheduleRequestsHandleApi(
  delegate: FetchLike,
): BaseApi & HandleExtras {
  const overrides: Record<HandleRoute, Override[]> = {
    approve: [],
    reject: [],
  };

  const handle = async (
    route: HandleRoute,
    yeuCauId: string,
    init: RequestInit | undefined,
  ): Promise<Response> => {
    const raw = typeof init?.body === 'string' ? init.body : '';
    let body: unknown = raw;
    try {
      body = JSON.parse(raw);
    } catch {
      // không phải JSON: giữ chuỗi thô để test thấy; kiểm thân bên dưới sẽ từ chối
    }
    const call: HandleCall = { yeuCauId, body };
    const last = api.requests.at(-1);
    if (last !== undefined) last.body = body;
    const override = overrides[route].shift();
    if (override) return override(init);

    const problems = validateBody(route, body);
    if (problems.length > 0) return invalid(problems);

    // 404 CÙNG thân cho "không có", "chi nhánh khác" và "id sai dạng" (thân của POST, B9: `YEU_CAU_DOI_LICH_KHONG_TON_TAI`)
    const missing = () =>
      jsonResponse(
        {
          maLoi: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
          thongBao: 'Không tìm thấy yêu cầu đổi lịch.',
        },
        404,
      );
    if (!BIGINT_ID.test(yeuCauId)) return missing();
    const found = (): FakeRequestRecord | undefined =>
      api.records.find(({ detail }) => detail.yeuCauId === yeuCauId);
    if (found() === undefined) return missing();

    (route === 'approve' ? api.approveCalls : api.rejectCalls).push(call);
    // Chạy NGAY khi nhận một POST hợp lệ, trước khi xử lý: test đổi kho ở đây để dựng đua (người khác vừa xử lý, khung giờ vừa bị chiếm)
    api.onHandle?.(route, call);
    const record = found();
    if (record === undefined) return missing();
    const detail = record.detail;
    if (detail.trangThai !== 'ChoDuyet')
      return failure(409, 'YEU_CAU_DA_XU_LY');

    const fields = body as { ghiChu: string; khungGioId?: string };
    if (route === 'approve') {
      if (!detail.coTheDuyet && detail.lyDoKhongDuyet !== null) {
        return failure(409, detail.lyDoKhongDuyet, { trangThai: 'DaHuy' });
      }
      if (fields.khungGioId === undefined) {
        const state = detail.khungGioMongMuon.trangThai;
        if (state !== 'ConTrong') return failure(409, SLOT_ERRORS[state]);
      } else {
        const error = api.replacementError(fields.khungGioId);
        if (error !== null) return failure(409, error);
      }
    }

    const handled: RequestDetail = {
      ...detail,
      trangThai: route === 'approve' ? 'DaDuyet' : 'TuChoi',
      coTheDuyet: false,
      lyDoKhongDuyet: 'YEU_CAU_DA_XU_LY',
      ghiChuXuLy: fields.ghiChu.trim(),
      thoiDiemXuLy: api.serverTime,
      nguoiXuLy: { hoTen: 'Lễ tân giả' },
    };
    record.detail = handled;
    return route === 'approve'
      ? jsonResponse({
          yeuCau: { trangThai: 'DaDuyet' },
          lichHenMoi: {
            maLichHen: api.newAppointmentCode,
            thoiGian: detail.thoiGianMongMuon,
            trangThai: 'DaXacNhan',
          },
          thoiGianMayChu: api.serverTime,
        })
      : jsonResponse({
          yeuCau: { trangThai: 'TuChoi' },
          thoiGianMayChu: api.serverTime,
        });
  };

  const base = createFakeRescheduleRequestsApi(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const match = HANDLE_PATTERN.exec(url.pathname.replace(/^\/api/, ''));
    if ((init?.method ?? 'GET') === 'POST' && match !== null) {
      return handle(
        match[2] as HandleRoute,
        decodeURIComponent(match[1]),
        init,
      );
    }
    return delegate(input, init);
  });
  // Khai báo SAU các hàm dùng nó (chúng chỉ đọc `api` lúc chạy, khi đã có giá trị)
  const api: BaseApi & HandleExtras = Object.assign(base, {
    approveCalls: [] as HandleCall[],
    rejectCalls: [] as HandleCall[],
    serverTime: '2026-11-25T03:00:00.000Z',
    newAppointmentCode: 'CLX-20261127-NEW01',
    replacementError: ((): string | null =>
      null) as HandleExtras['replacementError'],
    onHandle: null as ((route: HandleRoute, call: HandleCall) => void) | null,
    failNextWrite(route: HandleRoute, override: Override) {
      overrides[route].push(override);
    },
  });
  return api;
}
