import { describe, expect, it, vi } from 'vitest';
import { parseReschedulePreview } from '../appointments/patient/reschedule/reschedule-preview-api';
import { parseRescheduleResult } from '../appointments/patient/reschedule/reschedule-submit-api';
import {
  createFakeRescheduleApi,
  makeDoneResult,
  makePreview,
  makeRequestResult,
} from './fake-reschedule-api';

// reschedule F2, mã ca WDH-45 [đề xuất]: API giả của đổi lịch khớp HỢP ĐỒNG THẬT của B6 (TRACKING mục 7): thân `POST` của nó qua bộ đọc NGHIÊM của web, thân gửi sai ⇒ 400 như `PatientRescheduleDto`, preview có
// `khungGioId` luôn có `lichMoi`. Nếu API giả lệch hợp đồng thì mọi test trang xanh giả, nên có test riêng cho nó. Dữ liệu giả, không gọi backend thật.
const POST = (api: ReturnType<typeof createFakeRescheduleApi>, body: unknown) =>
  api.fetch('/api/patient/appointments/CP1/reschedule', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const GET = (api: ReturnType<typeof createFakeRescheduleApi>, search = '') =>
  api.fetch(`/api/patient/appointments/CP1/reschedule-preview${search}`);
const newApi = () =>
  createFakeRescheduleApi(
    async () => new Response('Không có', { status: 404 }),
  );

describe('POST …/reschedule của API giả (WDH-45)', () => {
  it('WDH-45 thân hợp lệ (chỉ `khungGioId`, hoặc kèm `lyDoYeuCau`) ⇒ 201; thân 201 mặc định và `makeRequestResult` đều qua bộ đọc NGHIÊM của web', async () => {
    const api = newApi();
    const response = await POST(api, { khungGioId: '9007199254740993' });
    expect(response.status).toBe(201);
    expect(parseRescheduleResult(await response.json())).toMatchObject({
      ketQua: 'DaDoi',
    });
    expect(
      (await POST(api, { khungGioId: '5', lyDoYeuCau: 'Có việc' })).status,
    ).toBe(201);
    expect(api.submitCalls.map((call) => call.maLichHen)).toEqual([
      'CP1',
      'CP1',
    ]);
    expect(parseRescheduleResult(makeDoneResult())).toStrictEqual(
      makeDoneResult(),
    );
    expect(parseRescheduleResult(makeRequestResult())).toStrictEqual(
      makeRequestResult(),
    );
  });

  it('WDH-45 `onSubmit` chạy đúng MỘT lần cho mỗi POST hợp lệ, KHÔNG chạy khi thân sai', async () => {
    const api = newApi();
    const seen = vi.fn();
    api.onSubmit = seen;
    await POST(api, { khungGioId: '5' });
    await POST(api, { khungGioId: 5 });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith({
      maLichHen: 'CP1',
      body: { khungGioId: '5' },
    });
  });

  it.each([
    [
      'khoá lạ',
      { khungGioId: '5', benhNhanId: '9' },
      'benhNhanId',
      'TRUONG_KHONG_DUOC_PHEP',
    ],
    [
      'khoá `yeuCauId` lạ',
      { khungGioId: '5', yeuCauId: '9' },
      'yeuCauId',
      'TRUONG_KHONG_DUOC_PHEP',
    ],
    ['id là số JSON', { khungGioId: 5 }, 'khungGioId', 'IS_BIGINT_ID'],
    ['id số 0 đứng đầu', { khungGioId: '007' }, 'khungGioId', 'IS_BIGINT_ID'],
    ['id rỗng', { khungGioId: '' }, 'khungGioId', 'IS_BIGINT_ID'],
    [
      'id vượt BIGINT',
      { khungGioId: '9223372036854775808' },
      'khungGioId',
      'IS_BIGINT_ID',
    ],
    ['thiếu id', { lyDoYeuCau: 'abc' }, 'khungGioId', 'IS_BIGINT_ID'],
    [
      'lý do là số',
      { khungGioId: '5', lyDoYeuCau: 5 },
      'lyDoYeuCau',
      'IS_STRING',
    ],
    [
      'lý do là đối tượng',
      { khungGioId: '5', lyDoYeuCau: {} },
      'lyDoYeuCau',
      'IS_STRING',
    ],
  ])(
    'WDH-45 thân sai (%s) ⇒ 400 `DU_LIEU_KHONG_HOP_LE` với `loi[]` như máy chủ thật',
    async (_name, body, truong, ma) => {
      const api = newApi();
      const response = await POST(api, body);
      expect(response.status).toBe(400);
      const json = (await response.json()) as {
        maLoi: string;
        loi: { truong: string; ma: string }[];
      };
      expect(json.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
      expect(json.loi).toContainEqual({ truong, ma });
    },
  );

  it.each([
    ['không phải JSON', 'abc'],
    ['mảng', '[]'],
    ['null', 'null'],
  ])('WDH-45 thân %s ⇒ 400', async (_name, raw) => {
    const response = await POST(newApi(), raw);
    expect(response.status).toBe(400);
  });

  it('WDH-45 `failNext("submit")` đứng TRƯỚC kiểm thân (để test dựng lỗi 409, 503, mạng) và dùng đúng một lần', async () => {
    const api = newApi();
    api.failNext('submit', () => new Response('x', { status: 503 }));
    expect((await POST(api, { khungGioId: '5' })).status).toBe(503);
    expect((await POST(api, { khungGioId: '5' })).status).toBe(201);
  });

  it('WDH-45 `api.submitResult` đổi được thân 201 (để thử thân sai hợp đồng); mọi đường dẫn khác chuyển cho `delegate`', async () => {
    const api = newApi();
    api.submitResult = { ketQua: 'DaDoi' };
    const response = await POST(api, { khungGioId: '5' });
    expect(response.status).toBe(201);
    const body: unknown = await response.json();
    expect(body).toEqual({ ketQua: 'DaDoi' });
    expect(() => parseRescheduleResult(body)).toThrow();
    expect((await api.fetch('/api/khong-co-trong-api-gia')).status).toBe(404);
  });
});

describe('GET …/reschedule-preview của API giả (WDH-45)', () => {
  it('WDH-45 có `khungGioId` mà thân có `lichMoi: null` ⇒ tự điền `lichMoi` đúng khung giờ đó (như B6), qua bộ đọc NGHIÊM; không có `khungGioId` ⇒ `lichMoi: null`', async () => {
    const api = newApi();
    const withSlot = parseReschedulePreview(
      await (await GET(api, '?khungGioId=9007199254740993')).json(),
    );
    expect(withSlot.lichMoi).toMatchObject({
      khungGioId: '9007199254740993',
      hopLe: true,
    });
    const without = parseReschedulePreview(await (await GET(api)).json());
    expect(without.lichMoi).toBeNull();
    expect(api.previewCalls).toEqual([
      { maLichHen: 'CP1', khungGioId: '9007199254740993' },
      { maLichHen: 'CP1', khungGioId: null },
    ]);
  });

  it('WDH-45 `api.candidate = null` ⇒ trả thân đúng như đã đặt (để thử hợp đồng gãy); thân đã có `lichMoi` thì giữ nguyên', async () => {
    const api = newApi();
    api.candidate = null;
    const raw = (await (await GET(api, '?khungGioId=5')).json()) as {
      lichMoi: unknown;
    };
    expect(raw.lichMoi).toBeNull();

    const other = newApi();
    other.preview = makePreview({
      lichMoi: {
        khungGioId: '8',
        thoiGian: '2026-12-03T03:00:00.000Z',
        hopLe: false,
      },
    });
    const kept = parseReschedulePreview(
      await (await GET(other, '?khungGioId=5')).json(),
    );
    expect(kept.lichMoi?.khungGioId).toBe('8');
  });

  it('WDH-45 `api.preview = null` ⇒ 404 `KHONG_TIM_THAY`', async () => {
    const api = newApi();
    api.preview = null;
    const response = await GET(api);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { maLoi: string }).maLoi).toBe(
      'KHONG_TIM_THAY',
    );
  });
});
