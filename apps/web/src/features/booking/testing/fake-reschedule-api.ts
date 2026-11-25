import type { ReschedulePreview } from '../appointments/patient/reschedule/reschedule-types';
import { createFakeAppointmentDetailApi } from './fake-appointment-detail-api';
import { jsonResponse } from './fake-appointment-list-api';

// API giả của đổi lịch hẹn cho test web (reschedule F1; F2 dùng lại và thêm `POST`). Bọc API giả của chi tiết lịch (`fake-appointment-detail-api.ts`) và THÊM hai đường dẫn GET:
//   /patient/appointments/:maLichHen/reschedule-preview  ⇒ `api.preview` (hợp đồng PLAN reschedule 5.8 cộng `lichCu.bacSiId`, Đại chốt 25/11/2026; backend B6 chưa có mã)
//   /public/doctor-slots?bacSiIds=&ngay=                 ⇒ lưới do `api.slotsFor(bacSiId, ngay)` dựng, đúng hình dạng thật của PR-C1 của search
// Mọi đường dẫn khác chuyển cho `delegate`. Ghi riêng hai danh sách `previewCalls` và `slotCalls` (kèm query) vì `requests` của API chi tiết bỏ query. KHÔNG gọi backend thật; dữ liệu giả.
// Dựng bằng tay (không import fixture của search): `features/booking` chỉ import search qua `index.ts` (BWZ-08).

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;
export type RescheduleRoute = 'preview' | 'slots';

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

const PREVIEW_PATTERN =
  /^\/patient\/appointments\/([^/]+)\/reschedule-preview$/;

export function createFakeRescheduleApi(delegate: FetchLike) {
  const overrides: Record<RescheduleRoute, Override[]> = {
    preview: [],
    slots: [],
  };

  const detailApi = createFakeAppointmentDetailApi(async (input, init) =>
    api.rescheduleFetch(input, init, delegate),
  );

  const api = {
    // Chi tiết, xem trước huỷ… của API giả chi tiết (đặt `api.detail.detail = makeDetail({...})`)
    detail: detailApi,
    // Thân 200 của preview; `null` ⇒ 404. Kiểu `unknown` để test đặt cả thân sai hợp đồng
    preview: makePreview() as unknown,
    // Lưới của MỘT bác sĩ trong MỘT ngày; test thay hàm để dựng ngày không có lịch, hết ô…
    slotsFor: defaultDay as (bacSiId: string, ngay: string) => FakeDay,
    previewCalls: [] as PreviewCall[],
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
        api.previewCalls.push({
          maLichHen: decodeURIComponent(previewMatch[1]),
          khungGioId: url.searchParams.get('khungGioId'),
        });
        const override = overrides.preview.shift();
        if (override) return override(init);
        if (api.preview === null) {
          return jsonResponse(
            { maLoi: 'KHONG_TIM_THAY', thongBao: 'Không tìm thấy.' },
            404,
          );
        }
        return jsonResponse(api.preview);
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
