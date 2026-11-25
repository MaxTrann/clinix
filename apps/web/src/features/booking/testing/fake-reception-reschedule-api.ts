import { isSlotId } from '../wizard/slot-id';
import type { ReceptionReschedulePreview } from '../appointments/reception/reschedule/reception-reschedule-types';
import { apiErrorResponse, jsonResponse } from './fake-appointment-list-api';
import {
  createFakeReceptionApi,
  makeReceptionDetail,
} from './fake-reception-api';
import {
  createFakeRescheduleApi,
  makeDoneResult,
  NEW_APPOINTMENT_CODE,
  NEW_SLOT_TIME,
  type PreviewCall,
  type SubmitCall,
} from './fake-reschedule-api';

// API giả của Lễ tân ĐỔI LỊCH HỘ cho test web (reschedule F3). Khớp hợp đồng THẬT của B7 (TRACKING mục 7 khối B7; `fake-reception-reschedule-api.test.ts`, WDO-13 khoá điều đó). Bọc API giả của Lễ tân
// (`createFakeReceptionApi`: danh sách, chi tiết, đổi trạng thái) và THÊM hai đường dẫn:
//   GET  /reception/appointments/:maLichHen/reschedule-preview  ⇒ `api.preview` (đúng SÁU khoá: không `loai`, `soLanDaDoi`, `soLanToiDa`; `api.candidate` tự điền `lichMoi` khi có `khungGioId`)
//   POST /reception/appointments/:maLichHen/reschedule          ⇒ 201 `api.submitResult`. Kiểm thân như `ReceptionRescheduleDto`: CHỈ `khungGioId` (id BIGINT dạng chuỗi) và `lyDo` (cắt bằng `trim()`, 1 đến 255 đơn vị
//                                                                 UTF-16, không giống bí mật); khoá lạ (`lyDoYeuCau`, `chiNhanhId`…) ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`; `lyDo` sai ⇒ 400 `LY_DO_BAT_BUOC`.
//                                                                 Lịch không có ⇒ 404 `KHONG_TIM_THAY` (cùng thân cho "không có" và "ngoài chi nhánh"); lịch không ở `DaXacNhan` (kể cả `DaDoiLich`, mà Lễ tân VẪN thấy)
//                                                                 ⇒ 409 `LICH_HEN_KHONG_CHO_DOI` kèm `chiTiet.trangThai`. Thành công mặc định ĐỔI trạng thái: lịch cũ thành `DaDoiLich`, lịch mới `NEW_APPOINTMENT_CODE` xuất hiện ở chi tiết.
// Lưới `/public/doctor-slots` do `createFakeRescheduleApi` dựng (`api.slots.slotsFor`, `api.slots.slotCalls`), mọi đường dẫn khác chuyển cho API giả của Lễ tân. Ghi riêng `previewCalls` và `submitCalls`
// (kèm query hay thân). KHÔNG gọi backend thật; dữ liệu giả.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;
export type ReceptionRescheduleRoute = 'preview' | 'submit';

const PREVIEW_PATTERN =
  /^\/reception\/appointments\/([^/]+)\/reschedule-preview$/;
const SUBMIT_PATTERN = /^\/reception\/appointments\/([^/]+)\/reschedule$/;

// Mô phỏng ĐỦ DÙNG của `redactText` (bộ che bí mật của máy chủ; `RequiredReason({ rejectSecrets: true })` từ chối chữ mà nó che): `Bearer …`, JWT, chuỗi hex 64, và `khoá=giá trị` với khoá nhạy cảm.
// Không bắt `mật khẩu: …` có dấu (TECH_DEBT 284), đúng như máy chủ.
const SECRET_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\./,
  /\b[0-9a-fA-F]{64}\b/,
  /(?:password|matkhau|token|secret|apikey|authorization|cookie|credential|otp)[\w.-]{0,64}["']?\s*[:=]\s*\S+/i,
];

export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

// Thân 200 của preview Lễ tân: ĐÚNG sáu khoá của B7; test ghi đè từng khoá (kể cả bỏ khoá hay thêm khoá lạ để thử thân sai hợp đồng, qua `api.preview = {...}`)
export function makeReceptionPreview(
  overrides: Partial<ReceptionReschedulePreview> = {},
): ReceptionReschedulePreview {
  return {
    choPhepDoi: true,
    coYeuCauChoDuyet: false,
    lichCu: { thoiGian: '2026-11-30T02:30:00.000Z', bacSiId: '12' },
    lichMoi: null,
    thoiGianMayChu: '2026-11-25T03:00:00.000Z',
    ...overrides,
  };
}

// 400 `DU_LIEU_KHONG_HOP_LE` của `ReceptionRescheduleDto`: `loi[].ma` giống máy chủ thật (`IS_BIGINT_ID`, `LY_DO_BAT_BUOC`, `TRUONG_KHONG_DUOC_PHEP`)
function invalidBodyResponse(loi: { truong: string; ma: string }[]): Response {
  return apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', loi);
}

export function checkReceptionSubmitBody(body: unknown): Response | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return invalidBodyResponse([
      { truong: 'body', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
  }
  const fields = body as Record<string, unknown>;
  const problems: { truong: string; ma: string }[] = [];
  for (const key of Object.keys(fields)) {
    if (key !== 'khungGioId' && key !== 'lyDo') {
      problems.push({ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' });
    }
  }
  if (typeof fields.khungGioId !== 'string' || !isSlotId(fields.khungGioId)) {
    problems.push({ truong: 'khungGioId', ma: 'IS_BIGINT_ID' });
  }
  const reason = fields.lyDo;
  const text = typeof reason === 'string' ? reason.trim() : null;
  if (
    text === null ||
    text.length < 1 ||
    text.length > 255 ||
    looksLikeSecret(text)
  ) {
    problems.push({ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' });
  }
  return problems.length === 0 ? null : invalidBodyResponse(problems);
}

export function createFakeReceptionRescheduleApi(delegate: FetchLike) {
  const overrides: Record<ReceptionRescheduleRoute, Override[]> = {
    preview: [],
    submit: [],
  };
  const reception = createFakeReceptionApi(delegate);
  // Chỉ để dùng lưới khung giờ `/public/doctor-slots`; mọi đường dẫn khác của nó chuyển tiếp cho `reception.fetch`
  const slots = createFakeRescheduleApi(reception.fetch);

  const notFound = () => apiErrorResponse(404, 'KHONG_TIM_THAY');
  // Trạng thái của lịch theo chi tiết (hoặc dòng danh sách) của API giả Lễ tân; `null` khi lịch không có (cùng 404 với "ngoài chi nhánh")
  const stateOf = (code: string): string | null => {
    const given = reception.details[code] as { trangThai?: string } | undefined;
    if (given !== undefined) return given.trangThai ?? null;
    const row = (
      reception.appointments as { maLichHen: string; trangThai: string }[]
    ).find((item) => item.maLichHen === code);
    return row?.trangThai ?? null;
  };

  const api = {
    // Chi tiết, danh sách, đổi trạng thái của API giả Lễ tân (đặt `api.reception.details[CODE] = makeReceptionDetail({...})`)
    reception,
    // Lưới khung giờ: `api.slots.slotsFor`, `api.slots.slotCalls`
    slots,
    // Thân 200 của preview; `null` ⇒ 404. Kiểu `unknown` để test đặt cả thân sai hợp đồng
    preview: makeReceptionPreview() as unknown,
    // Preview có `khungGioId` mà thân có `lichMoi: null` ⇒ tự điền khung giờ này (đúng như B7: có `khungGioId` thì luôn có `lichMoi`). `null` ⇒ trả thân đúng như đã đặt
    candidate: ((khungGioId: string) => ({
      khungGioId,
      thoiGian: NEW_SLOT_TIME,
      hopLe: true,
    })) as
      | ((khungGioId: string) => {
          khungGioId: string;
          thoiGian: string;
          hopLe: boolean;
          lyDoKhongHopLe?: string;
        })
      | null,
    // Thân 201 của POST (mặc định `DaDoi`); kiểu `unknown` để test đặt cả thân sai hợp đồng
    submitResult: makeDoneResult({ maLichHenCu: 'CP20261018001' }) as unknown,
    // Thành công mặc định đổi trạng thái của lịch cũ và dựng lịch mới (đặt `false` để test tự lo)
    applyDefaultEffects: true,
    // Chạy NGAY khi nhận một POST hợp lệ, trước khi trả lời: test đổi `api.reception.details` ở đây
    onSubmit: null as ((call: SubmitCall) => void) | null,
    previewCalls: [] as PreviewCall[],
    submitCalls: [] as SubmitCall[],

    // Lần gọi kế tiếp tới `route` dùng phản hồi này (lỗi 409, `Response` 502, ném lỗi mạng, hay một Promise treo cho tới khi test cho chạy tiếp)
    failNext(route: ReceptionRescheduleRoute, override: Override) {
      overrides[route].push(override);
    },

    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
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
        if (api.preview === null) return notFound();
        const body = api.preview;
        if (
          khungGioId !== null &&
          api.candidate !== null &&
          typeof body === 'object' &&
          body !== null &&
          (body as { lichMoi?: unknown }).lichMoi === null
        ) {
          return jsonResponse({ ...body, lichMoi: api.candidate(khungGioId) });
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
        const code = decodeURIComponent(submitMatch[1]).toUpperCase();
        const call = { maLichHen: decodeURIComponent(submitMatch[1]), body };
        api.submitCalls.push(call);
        const override = overrides.submit.shift();
        if (override) return override(init);
        // Thứ tự như B7: tham số đường dẫn (404 cùng thân) trước DTO (400), rồi luật của lịch (409)
        const state = stateOf(code);
        if (state === null) return notFound();
        const invalid = checkReceptionSubmitBody(body);
        if (invalid !== null) return invalid;
        if (state !== 'DaXacNhan') {
          return apiErrorResponse(409, 'LICH_HEN_KHONG_CHO_DOI', undefined, {
            trangThai: state,
          });
        }
        api.onSubmit?.(call);
        if (api.applyDefaultEffects) {
          const current = (reception.details[code] ??
            makeReceptionDetail({ maLichHen: code })) as object;
          reception.details[code] = {
            ...current,
            trangThai: 'DaDoiLich',
            chuyenDuoc: [],
            conPhaiThu: null,
            choPhepDoiLich: false,
          };
          reception.details[NEW_APPOINTMENT_CODE] = makeReceptionDetail({
            maLichHen: NEW_APPOINTMENT_CODE,
            thoiGian: NEW_SLOT_TIME,
          });
        }
        return jsonResponse(api.submitResult, 201);
      }

      return slots.fetch(input, init);
    },
  };
  return api;
}
