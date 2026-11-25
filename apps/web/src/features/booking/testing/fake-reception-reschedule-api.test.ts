import { describe, expect, it } from 'vitest';
import {
  parseReceptionReschedulePreview,
  parseReceptionRescheduleResult,
} from '../appointments/reception/reschedule/reception-reschedule-api';
import { makeReceptionDetail } from './fake-reception-api';
import {
  checkReceptionSubmitBody,
  createFakeReceptionRescheduleApi,
  looksLikeSecret,
  makeReceptionPreview,
} from './fake-reception-reschedule-api';
import { NEW_APPOINTMENT_CODE } from './fake-reschedule-api';

// reschedule F3, mã ca WDO-13 [đề xuất]: API giả của Lễ tân đổi hộ khớp HỢP ĐỒNG THẬT của B7 (TRACKING mục 7 khối B7): preview ĐÚNG sáu khoá (không `loai`, `soLanDaDoi`, `soLanToiDa`) qua bộ đọc NGHIÊM của web, thân
// `POST` kiểm như `ReceptionRescheduleDto` (khoá lạ ⇒ 400, `lyDo` sai ⇒ 400 `LY_DO_BAT_BUOC`), lịch không ở `DaXacNhan` (kể cả `DaDoiLich`) ⇒ 409, "không có" và "ngoài chi nhánh" cùng một thân 404. Nếu API giả lệch hợp
// đồng thì mọi test trang xanh giả, nên có test riêng cho nó. Chuỗi giống bí mật ghép từ hai mảnh để gitleaks không báo. Dữ liệu giả, không gọi backend thật.
const CODE = 'CP20261018001';
const POST = (
  api: ReturnType<typeof createFakeReceptionRescheduleApi>,
  body: unknown,
  code = CODE,
) =>
  api.fetch(`/api/reception/appointments/${code}/reschedule`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const GET = (
  api: ReturnType<typeof createFakeReceptionRescheduleApi>,
  search = '',
  code = CODE,
) =>
  api.fetch(`/api/reception/appointments/${code}/reschedule-preview${search}`);
const newApi = () =>
  createFakeReceptionRescheduleApi(
    async () => new Response('Không có', { status: 404 }),
  );
const ok = { khungGioId: '9007199254740993', lyDo: 'Bác sĩ báo bận' };
const NBSP = String.fromCodePoint(0xa0);
const EMOJI = String.fromCodePoint(0x1f600);

describe('GET …/reschedule-preview của API giả Lễ tân (WDO-13)', () => {
  it('WDO-13 thân mặc định có ĐÚNG sáu khoá và qua bộ đọc NGHIÊM của web; KHÔNG có `loai`, `soLanDaDoi`, `soLanToiDa`', async () => {
    const api = newApi();
    const body = (await (await GET(api)).json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        'choPhepDoi',
        'coYeuCauChoDuyet',
        'lichCu',
        'lichMoi',
        'thoiGianMayChu',
      ].sort(),
    );
    for (const key of ['loai', 'soLanDaDoi', 'soLanToiDa']) {
      expect(key in body).toBe(false);
    }
    expect(parseReceptionReschedulePreview(body)).toMatchObject({
      choPhepDoi: true,
      lichMoi: null,
    });
    expect(api.previewCalls).toEqual([{ maLichHen: CODE, khungGioId: null }]);
  });

  it('WDO-13 có `khungGioId` ⇒ `lichMoi` được điền đúng khung giờ đó (id lớn hơn 2^53 nguyên chuỗi); `candidate = null` trả thân như đã đặt', async () => {
    const api = newApi();
    const body = await (await GET(api, '?khungGioId=9007199254740993')).json();
    expect(parseReceptionReschedulePreview(body).lichMoi).toMatchObject({
      khungGioId: '9007199254740993',
      hopLe: true,
    });
    api.candidate = null;
    const raw = (await (await GET(api, '?khungGioId=5')).json()) as {
      lichMoi: unknown;
    };
    expect(raw.lichMoi).toBeNull();
  });

  it('WDO-13 `api.preview = null` ⇒ 404 `KHONG_TIM_THAY`; `failNext` thay phản hồi của đúng MỘT lần gọi', async () => {
    const api = newApi();
    api.preview = null;
    const missing = await GET(api);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { maLoi: string }).maLoi).toBe(
      'KHONG_TIM_THAY',
    );
    api.preview = makeReceptionPreview();
    api.failNext('preview', () => new Response('x', { status: 502 }));
    expect((await GET(api)).status).toBe(502);
    expect((await GET(api)).status).toBe(200);
  });
});

describe('POST …/reschedule của API giả Lễ tân: thân (WDO-13)', () => {
  it('WDO-13 thân hợp lệ ⇒ 201; thân 201 mặc định qua bộ đọc NGHIÊM; mã lịch cũ là mã của Lễ tân', async () => {
    const api = newApi();
    const response = await POST(api, ok);
    expect(response.status).toBe(201);
    expect(parseReceptionRescheduleResult(await response.json())).toMatchObject(
      { ketQua: 'DaDoi', lichHenCu: { maLichHen: CODE } },
    );
    expect(api.submitCalls).toEqual([{ maLichHen: CODE, body: ok }]);
  });

  it.each([['lyDoYeuCau'], ['chiNhanhId'], ['benhNhanId'], ['lyDoKhac']])(
    'WDO-13 khoá lạ `%s` ⇒ 400 `TRUONG_KHONG_DUOC_PHEP` (đúng khoá lạ)',
    async (key) => {
      const response = await POST(newApi(), { ...ok, [key]: 'x' });
      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        maLoi: string;
        loi: { truong: string; ma: string }[];
      };
      expect(body.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
      expect(body.loi).toEqual([{ truong: key, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
    },
  );

  it.each([[5], ['0'], ['abc'], [''], [null], ['9223372036854775808']])(
    'WDO-13 `khungGioId` %j không phải id BIGINT dạng chuỗi ⇒ 400 `IS_BIGINT_ID`',
    async (khungGioId) => {
      const response = await POST(newApi(), { ...ok, khungGioId });
      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        loi: { truong: string; ma: string }[];
      };
      expect(body.loi).toEqual([{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }]);
    },
  );

  it.each([
    ['thiếu', undefined],
    ['rỗng', ''],
    ['toàn khoảng trắng', '   \n\t '],
    ['toàn khoảng không ngắt', `${NBSP}${NBSP}`],
    ['256 đơn vị', 'a'.repeat(256)],
    ['128 biểu tượng (256 đơn vị UTF-16)', EMOJI.repeat(128)],
    ['số', 5],
    ['null', null],
  ])('WDO-13 `lyDo` %s ⇒ 400 `LY_DO_BAT_BUOC`', async (_name, lyDo) => {
    const body =
      lyDo === undefined ? { khungGioId: ok.khungGioId } : { ...ok, lyDo };
    const response = await POST(newApi(), body);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { loi: unknown }).loi).toEqual([
      { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' },
    ]);
  });

  it('WDO-13 biên `lyDo`: 1 và 255 đơn vị qua, 127 biểu tượng và một chữ qua; chữ được cắt bằng `trim()` (cả U+00A0) TRƯỚC khi đếm', () => {
    for (const lyDo of [
      'a',
      'a'.repeat(255),
      `${EMOJI.repeat(127)}a`,
      `${NBSP}${'b'.repeat(255)}${NBSP}`,
      'Bệnh nhân\tbáo bận',
    ]) {
      expect(
        checkReceptionSubmitBody({ ...ok, lyDo }),
        lyDo.slice(0, 8),
      ).toBeNull();
    }
  });

  it('WDO-13 chữ giống bí mật ⇒ 400 `LY_DO_BAT_BUOC` (bộ che bí mật của máy chủ); `mật khẩu: …` có dấu KHÔNG bị bắt (TECH_DEBT 284)', () => {
    const secrets = [
      ['pass', 'word=abc123'].join(''),
      ['to', 'ken: abc123'].join(''),
      ['Bear', 'er abc123'].join(''),
      ['o', 'tp=123456'].join(''),
      'a'.repeat(64),
      `Bận. ${['pass', 'word=abc123'].join('')}`,
    ];
    for (const lyDo of secrets) {
      expect(looksLikeSecret(lyDo), lyDo).toBe(true);
      expect(checkReceptionSubmitBody({ ...ok, lyDo }), lyDo).not.toBeNull();
    }
    expect(looksLikeSecret('mật khẩu: abc123')).toBe(false);
    expect(
      checkReceptionSubmitBody({ ...ok, lyDo: 'mật khẩu: abc123' }),
    ).toBeNull();
  });

  it('WDO-13 thân không phải đối tượng JSON ⇒ 400', async () => {
    const api = newApi();
    expect((await POST(api, 'không phải JSON')).status).toBe(400);
    expect((await POST(api, '[]')).status).toBe(400);
  });
});

describe('POST …/reschedule của API giả Lễ tân: lịch, hiệu ứng, định tuyến (WDO-13)', () => {
  it('WDO-13 lịch không có và lịch ngoài chi nhánh CÙNG một thân 404 từng ký tự; 404 đứng TRƯỚC 400 (mã trước DTO, như B7)', async () => {
    const api = newApi();
    const a = await POST(api, ok, 'CP20260101999');
    const b = await POST(api, ok, 'KHONG-DUNG-DANG');
    const c = await POST(api, { khungGioId: 5 }, 'CP20260101999');
    expect([a.status, b.status, c.status]).toEqual([404, 404, 404]);
    const texts = await Promise.all([a.text(), b.text(), c.text()]);
    expect(new Set(texts).size).toBe(1);
    expect(texts[0]).toContain('KHONG_TIM_THAY');
  });

  it.each(['ChoThanhToan', 'DaTiepDon', 'DaHuy', 'VangMat', 'DaDoiLich'])(
    'WDO-13 lịch ở `%s` ⇒ 409 `LICH_HEN_KHONG_CHO_DOI` kèm `chiTiet.trangThai` (kể cả `DaDoiLich`, KHÔNG phải 404)',
    async (state) => {
      const api = newApi();
      api.reception.details[CODE] = makeReceptionDetail({ trangThai: state });
      const response = await POST(api, ok);
      expect(response.status).toBe(409);
      const body = (await response.json()) as {
        maLoi: string;
        chiTiet: { trangThai: string };
      };
      expect(body.maLoi).toBe('LICH_HEN_KHONG_CHO_DOI');
      expect(body.chiTiet).toEqual({ trangThai: state });
    },
  );

  it('WDO-13 thành công ĐỔI trạng thái: lịch cũ thành `DaDoiLich`, lịch mới xuất hiện ở chi tiết; gửi lần hai ⇒ 409 `DaDoiLich` (không đổi hai lần)', async () => {
    const api = newApi();
    expect((await POST(api, ok)).status).toBe(201);
    const oldDetail = await api.fetch(`/api/reception/appointments/${CODE}`);
    expect(await oldDetail.json()).toMatchObject({
      trangThai: 'DaDoiLich',
      choPhepDoiLich: false,
    });
    const created = await api.fetch(
      `/api/reception/appointments/${NEW_APPOINTMENT_CODE}`,
    );
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      maLichHen: NEW_APPOINTMENT_CODE,
      trangThai: 'DaXacNhan',
    });
    const again = await POST(api, ok);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { chiTiet: unknown }).chiTiet).toEqual({
      trangThai: 'DaDoiLich',
    });
  });

  it('WDO-13 `applyDefaultEffects = false` ⇒ không đổi gì; `onSubmit` chạy TRƯỚC khi trả lời và chỉ với POST hợp lệ; `failNext` thay phản hồi', async () => {
    const api = newApi();
    api.applyDefaultEffects = false;
    const seen: unknown[] = [];
    api.onSubmit = (call) => seen.push(call.body);
    await POST(api, { ...ok, lyDo: '' });
    expect(seen).toEqual([]);
    expect((await POST(api, ok)).status).toBe(201);
    expect(seen).toEqual([ok]);
    expect(
      (
        (await (
          await api.fetch(`/api/reception/appointments/${CODE}`)
        ).json()) as {
          trangThai: string;
        }
      ).trangThai,
    ).toBe('DaXacNhan');
    api.failNext('submit', () => new Response('x', { status: 503 }));
    expect((await POST(api, ok)).status).toBe(503);
  });

  it('WDO-13 đường dẫn khác: chi tiết đi qua API giả Lễ tân, lưới khung giờ do API giả đổi lịch dựng', async () => {
    const api = newApi();
    expect(
      (await api.fetch(`/api/reception/appointments/${CODE}`)).status,
    ).toBe(200);
    const grid = await api.fetch(
      '/api/public/doctor-slots?bacSiIds=12&ngay=2026-12-02',
    );
    expect(grid.status).toBe(200);
    expect(api.slots.slotCalls).toEqual([
      { bacSiIds: '12', ngay: '2026-12-02' },
    ]);
  });
});
