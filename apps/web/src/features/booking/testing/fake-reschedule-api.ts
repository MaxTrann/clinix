import { isSlotId } from '../wizard/slot-id';
import type { RescheduleCandidate } from '../appointments/common/reschedule-payload';
import type { ReschedulePreview } from '../appointments/patient/reschedule/reschedule-types';
import { createFakeAppointmentDetailApi } from './fake-appointment-detail-api';
import { jsonResponse } from './fake-appointment-list-api';

// API giả của đổi lịch hẹn cho test web (reschedule F1; F2 thêm `POST`). Bọc API giả của chi tiết lịch (`fake-appointment-detail-api.ts`) và THÊM ba đường dẫn:
//   GET  /patient/appointments/:maLichHen/reschedule-preview  ⇒ `api.preview` (hợp đồng PLAN reschedule 5.8 cộng `lichCu.bacSiId`; backend B6 đã khớp, TRACKING mục 7)
//   POST /patient/appointments/:maLichHen/reschedule          ⇒ `api.submitResult` (201; hợp đồng B6, F2). Kiểm thân như `PatientRescheduleDto`: chỉ `khungGioId` (chuỗi id) và `lyDoYeuCau` (chuỗi);
//                                                               sai thân ⇒ 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[]` như máy chủ thật
//   GET  /public/doctor-slots?bacSiIds=&ngay=                 ⇒ lưới do `api.slotsFor(bacSiId, ngay)` dựng, đúng hình dạng thật của PR-C1 của search
// Mọi đường dẫn khác chuyển cho `delegate`. Ghi riêng ba danh sách `previewCalls`, `submitCalls` và `slotCalls` (kèm query hay thân) vì `requests` của API chi tiết bỏ query. KHÔNG gọi backend thật; dữ liệu giả.
// Dựng bằng tay (không import fixture của search): `features/booking` chỉ import search qua `index.ts` (BWZ-08).

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;
export type RescheduleRoute = 'preview' | 'slots' | 'submit';

export interface FakeSlot {
  khungGioId: string;
  batDau: string;
  ketThuc: string;
  ca: 'CaSang' | 'CaChieu' | 'CaToi';
  trangThai: 'ConTrong' | 'DangGiuCho' | 'DaDat' | 'HetHan';
}

export interface FakeDay {
  bacSiId: string;
  trangThaiNgay: 'CoLich' | 'KhongCoLich' | 'ChiNhanhNghi';
  thuNghi?: number;
  khungGio: FakeSlot[];
}

// Thân 200 của preview: đủ khoá của 5.8; test ghi đè từng khoá (kể cả bỏ khoá để thử thân sai hợp đồng, qua `api.preview = {...}`)
export function makePreview(
  overrides: Partial<ReschedulePreview> = {},
): ReschedulePreview {
  return {
    choPhepDoi: true,
    loai: 'TuDoi',
    soLanDaDoi: 0,
    soLanToiDa: 2,
    coYeuCauChoDuyet: false,
    lichCu: { thoiGian: '2026-11-30T02:30:00.000Z', bacSiId: '12' },
    lichMoi: null,
    thoiGianMayChu: '2026-11-25T03:00:00.000Z',
    ...overrides,
  };
}

// Giờ của khung giờ mới mặc định (02/12/2026 10:00 giờ Việt Nam) và mã lịch mới của `DaDoi`
export const NEW_SLOT_TIME = '2026-12-02T03:00:00.000Z';
export const NEW_APPOINTMENT_CODE = 'CP20261020002';

// 201 `DaDoi` đủ khoá của B6 (KHÔNG `lich_hen_id`); `lichHenCu` là mã của chi tiết mẫu
export function makeDoneResult(
  overrides: { maLichHenMoi?: string; maLichHenCu?: string } = {},
) {
  return {
    ketQua: 'DaDoi',
    lichHenMoi: {
      maLichHen: overrides.maLichHenMoi ?? NEW_APPOINTMENT_CODE,
      thoiGian: NEW_SLOT_TIME,
      trangThai: 'DaXacNhan',
    },
    lichHenCu: { maLichHen: overrides.maLichHenCu ?? 'CP20261020001' },
    thoiGianMayChu: '2026-11-25T03:00:00.000Z',
  };
}

// 201 `DaGuiYeuCau` đủ khoá của B6 (KHÔNG `yeuCauId`)
export function makeRequestResult() {
  return {
    ketQua: 'DaGuiYeuCau',
    yeuCau: { trangThai: 'ChoDuyet', thoiGianMongMuon: NEW_SLOT_TIME },
    thoiGianMayChu: '2026-11-25T03:00:00.000Z',
  };
}

// Giờ viết theo GIỜ VIỆT NAM ("09:30"), đổi sang ISO UTC như máy chủ trả; khung dài 30 phút
export function fakeSlot(
  khungGioId: string,
  ngay: string,
  gio: string,
  trangThai: FakeSlot['trangThai'] = 'ConTrong',
  ca: FakeSlot['ca'] = 'CaSang',
): FakeSlot {
  const start = new Date(`${ngay}T${gio}:00+07:00`);
  return {
    khungGioId,
    batDau: start.toISOString(),
    ketThuc: new Date(start.getTime() + 30 * 60_000).toISOString(),
    ca,
    trangThai,
  };
}

export const fakeDay = (bacSiId: string, khungGio: FakeSlot[]): FakeDay => ({
  bacSiId,
  trangThaiNgay: 'CoLich',
  khungGio,
});

// Lưới mặc định: hai ô còn trống và một ô đã đặt (ô "của lịch cũ"), id khác nhau theo ngày để test biết ngày nào đang hiện
function defaultDay(bacSiId: string, ngay: string): FakeDay {
  const tag = ngay.slice(8);
  return fakeDay(bacSiId, [
    fakeSlot(`1${tag}1`, ngay, '08:00'),
    fakeSlot(`1${tag}2`, ngay, '08:30', 'DaDat'),
    fakeSlot(`1${tag}3`, ngay, '09:00'),
  ]);
}

export interface PreviewCall {
  maLichHen: string;
  khungGioId: string | null;
}
export interface SlotCall {
  bacSiIds: string;
  ngay: string;
}
// Lời gọi `POST …/reschedule`: `body` là thân đã `JSON.parse` (đối tượng), hoặc chuỗi thô nếu không phải JSON
export interface SubmitCall {
  maLichHen: string;
  body: unknown;
}

const PREVIEW_PATTERN =
  /^\/patient\/appointments\/([^/]+)\/reschedule-preview$/;
const SUBMIT_PATTERN = /^\/patient\/appointments\/([^/]+)\/reschedule$/;

// 400 `DU_LIEU_KHONG_HOP_LE` của `PatientRescheduleDto`: `loi[].ma` giống máy chủ thật (`IS_BIGINT_ID`, `IS_STRING`, `TRUONG_KHONG_DUOC_PHEP`)
function invalidBodyResponse(loi: { truong: string; ma: string }[]): Response {
  return jsonResponse(
    {
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      thongBao: 'Dữ liệu không hợp lệ.',
      loi,
    },
    400,
  );
}

function checkSubmitBody(body: unknown): Response | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return invalidBodyResponse([
      { truong: 'body', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
  }
  const fields = body as Record<string, unknown>;
  const problems: { truong: string; ma: string }[] = [];
  for (const key of Object.keys(fields)) {
    if (key !== 'khungGioId' && key !== 'lyDoYeuCau') {
      problems.push({ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' });
    }
  }
  if (typeof fields.khungGioId !== 'string' || !isSlotId(fields.khungGioId)) {
    problems.push({ truong: 'khungGioId', ma: 'IS_BIGINT_ID' });
  }
  if (
    fields.lyDoYeuCau !== undefined &&
    typeof fields.lyDoYeuCau !== 'string'
  ) {
    problems.push({ truong: 'lyDoYeuCau', ma: 'IS_STRING' });
  }
  return problems.length === 0 ? null : invalidBodyResponse(problems);
}

export function createFakeRescheduleApi(delegate: FetchLike) {
  const overrides: Record<RescheduleRoute, Override[]> = {
    preview: [],
    slots: [],
    submit: [],
  };

  const detailApi = createFakeAppointmentDetailApi(async (input, init) =>
    api.rescheduleFetch(input, init, delegate),
  );

  const api = {
    // Chi tiết, xem trước huỷ… của API giả chi tiết (đặt `api.detail.detail = makeDetail({...})`)
    detail: detailApi,
    // Thân 200 của preview; `null` ⇒ 404. Kiểu `unknown` để test đặt cả thân sai hợp đồng
    preview: makePreview() as unknown,
    // Preview có `khungGioId` mà thân có `lichMoi: null` ⇒ tự điền khung giờ này (đúng như B6: có `khungGioId` thì luôn có `lichMoi`). `null` ⇒ trả thân đúng như đã đặt
    candidate: ((khungGioId: string) => ({
      khungGioId,
      thoiGian: NEW_SLOT_TIME,
      hopLe: true,
    })) as ((khungGioId: string) => RescheduleCandidate) | null,
    // Thân 201 của POST (mặc định `DaDoi`); kiểu `unknown` để test đặt cả thân sai hợp đồng
    submitResult: makeDoneResult() as unknown,
    // Chạy NGAY khi nhận một POST hợp lệ, trước khi trả lời: test đổi `api.detail.detail` sang lịch mới hay lịch có yêu cầu chờ ở đây
    onSubmit: null as ((call: SubmitCall) => void) | null,
    // Lưới của MỘT bác sĩ trong MỘT ngày; test thay hàm để dựng ngày không có lịch, hết ô…
    slotsFor: defaultDay as (bacSiId: string, ngay: string) => FakeDay,
    previewCalls: [] as PreviewCall[],
    submitCalls: [] as SubmitCall[],
    slotCalls: [] as SlotCall[],

    // Lần gọi kế tiếp tới `route` dùng phản hồi này (lỗi 409, `Response` 502, ném lỗi mạng, hay một Promise treo cho tới khi test cho chạy tiếp)
    failNext(route: RescheduleRoute, override: Override) {
      overrides[route].push(override);
    },

    async rescheduleFetch(
      input: RequestInfo | URL,
      init: RequestInit | undefined,
      next: FetchLike,
    ) {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';

      const previewMatch = PREVIEW_PATTERN.exec(path);
      if (previewMatch !== null && method === 'GET') {
        const khungGioId = url.searchParams.get('khungGioId');
        api.previewCalls.push({
          maLichHen: decodeURIComponent(previewMatch[1]),
          khungGioId,
        });
        const override = overrides.preview.shift();
        if (override) return override(init);
        if (api.preview === null) {
          return jsonResponse(
            { maLoi: 'KHONG_TIM_THAY', thongBao: 'Không tìm thấy.' },
            404,
          );
        }
        const body = api.preview;
        if (
          khungGioId !== null &&
          api.candidate !== null &&
          typeof body === 'object' &&
          body !== null &&
          (body as { lichMoi?: unknown }).lichMoi === null
        ) {
          return jsonResponse({
            ...body,
            lichMoi: api.candidate(khungGioId),
          });
        }
        return jsonResponse(body);
      }

      const submitMatch = SUBMIT_PATTERN.exec(path);
      if (submitMatch !== null && method === 'POST') {
        const raw = typeof init?.body === 'string' ? init.body : '';
        let body: unknown = raw;
        try {
          body = JSON.parse(raw);
        } catch {
          // không phải JSON: giữ chuỗi thô để test thấy; kiểm thân bên dưới sẽ từ chối
        }
        const call = {
          maLichHen: decodeURIComponent(submitMatch[1]),
          body,
        };
        api.submitCalls.push(call);
        const override = overrides.submit.shift();
        if (override) return override(init);
        const invalid = checkSubmitBody(body);
        if (invalid !== null) return invalid;
        api.onSubmit?.(call);
        return jsonResponse(api.submitResult, 201);
      }

      if (path === '/public/doctor-slots' && method === 'GET') {
        const bacSiIds = url.searchParams.get('bacSiIds') ?? '';
        const ngay = url.searchParams.get('ngay') ?? '';
        api.slotCalls.push({ bacSiIds, ngay });
        const override = overrides.slots.shift();
        if (override) return override(init);
        return jsonResponse({
          ngay,
          items: bacSiIds
            .split(',')
            .filter((id) => id !== '')
            .map((id) => api.slotsFor(id, ngay)),
        });
      }
      return next(input, init);
    },

    fetch: detailApi.fetch,
  };
  return api;
}
