import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import {
  ApiError,
  NetworkError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import {
  getReceptionReschedulePreview,
  parseReceptionReschedulePreview,
  parseReceptionRescheduleResult,
  submitReceptionReschedule,
} from './reception-reschedule-api';

// reschedule F3: bộ đọc NGHIÊM và hai lời gọi `GET …/reschedule-preview` và `POST …/reschedule` của Lễ tân (hợp đồng THẬT của B7: TRACKING mục 7). Mã WDO-08 (preview) và WDO-09 (lời gọi, kết quả) là [đề xuất]. Dữ liệu giả.
const PREVIEW = {
  choPhepDoi: true,
  coYeuCauChoDuyet: false,
  lichCu: { thoiGian: '2026-11-30T02:30:00.000Z', bacSiId: '12' },
  lichMoi: null,
  thoiGianMayChu: '2026-11-25T03:00:00.123Z',
};
const NEW_SLOT = {
  khungGioId: '9007199254740993',
  thoiGian: '2026-12-01T03:00:00.000Z',
  hopLe: true,
};
const DONE = {
  ketQua: 'DaDoi',
  lichHenMoi: {
    maLichHen: 'CP20261201002',
    thoiGian: '2026-12-01T03:00:00.000Z',
    trangThai: 'DaXacNhan',
  },
  lichHenCu: { maLichHen: 'CP20261130001' },
  thoiGianMayChu: '2026-11-25T03:00:00.123Z',
};

const unusable = (raw: unknown) =>
  expect(() => parseReceptionReschedulePreview(raw)).toThrow(
    UnexpectedResponseError,
  );
const without = <T extends object>(value: T, key: keyof T) => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};

describe('parseReceptionReschedulePreview (WDO-08)', () => {
  it('WDO-08 đủ SÁU khoá, `lichMoi` null (chỉ hỏi điều kiện đổi) ⇒ giữ nguyên, id là chuỗi, `lyDoKhongDoi` vắng', () => {
    const parsed = parseReceptionReschedulePreview(PREVIEW);
    expect(parsed).toStrictEqual(PREVIEW);
    expect(parsed.lichCu.bacSiId).toBe('12');
    expect('lyDoKhongDoi' in parsed).toBe(false);
  });

  it('WDO-08 `lichMoi` đủ khoá: id lớn hơn 2^53 giữ NGUYÊN chuỗi; `hopLe = false` kèm `lyDoKhongHopLe`', () => {
    const valid = parseReceptionReschedulePreview({
      ...PREVIEW,
      lichMoi: NEW_SLOT,
    });
    expect(valid.lichMoi).toStrictEqual(NEW_SLOT);
    expect(valid.lichMoi?.khungGioId).toBe('9007199254740993');
    const invalid = parseReceptionReschedulePreview({
      ...PREVIEW,
      lichMoi: {
        ...NEW_SLOT,
        hopLe: false,
        lyDoKhongHopLe: 'KHUNG_GIO_KHAC_BAC_SI',
      },
    });
    expect(invalid.lichMoi).toStrictEqual({
      ...NEW_SLOT,
      hopLe: false,
      lyDoKhongHopLe: 'KHUNG_GIO_KHAC_BAC_SI',
    });
  });

  it('WDO-08 không đổi được: `lyDoKhongDoi` là chuỗi mã (kể cả `LICH_HEN_KHONG_CHO_DOI` của lịch `DaDoiLich`), `coYeuCauChoDuyet` đọc đúng và KHÔNG chặn', () => {
    for (const code of [
      'LICH_HEN_KHONG_CHO_DOI',
      'LICH_HEN_DA_QUA_GIO',
      'HO_SO_NGUOI_THAN_DA_NGUNG',
      'CHUOI_DOI_LICH_QUA_DAI',
    ]) {
      const parsed = parseReceptionReschedulePreview({
        ...PREVIEW,
        choPhepDoi: false,
        lyDoKhongDoi: code,
      });
      expect(parsed.choPhepDoi).toBe(false);
      expect(parsed.lyDoKhongDoi).toBe(code);
    }
    const pending = parseReceptionReschedulePreview({
      ...PREVIEW,
      coYeuCauChoDuyet: true,
    });
    expect(pending.choPhepDoi).toBe(true);
    expect(pending.coYeuCauChoDuyet).toBe(true);
  });

  it('WDO-08 khoá thừa (`loai`, `soLanDaDoi`, `soLanToiDa`, khoá lạ ở mọi cấp) KHÔNG được chép ra kết quả', () => {
    const parsed = parseReceptionReschedulePreview({
      ...PREVIEW,
      loai: 'TuDoi',
      soLanDaDoi: 1,
      soLanToiDa: 2,
      lichHenId: '7',
      lichCu: { ...PREVIEW.lichCu, ten: 'Nguyen Van A' },
      lichMoi: { ...NEW_SLOT, giaTien: '1' },
    });
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'choPhepDoi',
        'coYeuCauChoDuyet',
        'lichCu',
        'lichMoi',
        'thoiGianMayChu',
      ].sort(),
    );
    expect(Object.keys(parsed.lichCu).sort()).toEqual(['bacSiId', 'thoiGian']);
    expect(Object.keys(parsed.lichMoi ?? {}).sort()).toEqual([
      'hopLe',
      'khungGioId',
      'thoiGian',
    ]);
  });

  it.each([
    'choPhepDoi',
    'coYeuCauChoDuyet',
    'lichCu',
    'lichMoi',
    'thoiGianMayChu',
  ] as const)('WDO-08 thiếu khoá `%s` ⇒ không dùng được', (key) => {
    unusable(without(PREVIEW, key));
  });

  it.each([
    ['choPhepDoi chuỗi', { choPhepDoi: 'true' }],
    ['choPhepDoi số', { choPhepDoi: 1 }],
    ['coYeuCauChoDuyet null', { coYeuCauChoDuyet: null }],
    ['lyDoKhongDoi null', { lyDoKhongDoi: null }],
    ['lyDoKhongDoi số', { lyDoKhongDoi: 5 }],
    ['thoiGianMayChu không phải ISO', { thoiGianMayChu: 'hôm nay' }],
    ['lichCu thiếu bacSiId', { lichCu: { thoiGian: PREVIEW.lichCu.thoiGian } }],
    ['lichCu bacSiId là số', { lichCu: { ...PREVIEW.lichCu, bacSiId: 12 } }],
    [
      'lichCu bacSiId có số 0 đầu',
      { lichCu: { ...PREVIEW.lichCu, bacSiId: '012' } },
    ],
    ['lichCu thoiGian sai', { lichCu: { ...PREVIEW.lichCu, thoiGian: 'x' } }],
    ['lichCu null', { lichCu: null }],
    ['lichMoi thiếu hopLe', { lichMoi: without(NEW_SLOT, 'hopLe') }],
    ['lichMoi khungGioId là số', { lichMoi: { ...NEW_SLOT, khungGioId: 9 } }],
    ['lichMoi thiếu thoiGian', { lichMoi: without(NEW_SLOT, 'thoiGian') }],
    [
      'lichMoi lyDoKhongHopLe null',
      { lichMoi: { ...NEW_SLOT, lyDoKhongHopLe: null } },
    ],
    ['lichMoi là chuỗi', { lichMoi: 'x' }],
  ])('WDO-08 sai hình dạng (%s) ⇒ không dùng được', (_name, patch) => {
    unusable({ ...PREVIEW, ...patch });
  });

  it.each([null, [], 'x', 5, undefined])(
    'WDO-08 thân không phải đối tượng (%j) ⇒ không dùng được',
    (raw) => {
      unusable(raw);
    },
  );
});

describe('parseReceptionRescheduleResult (WDO-09)', () => {
  it('WDO-09 `DaDoi` đủ khoá ⇒ giữ nguyên; khoá thừa (kể cả `lyDo`, `lich_hen_id`) KHÔNG chép ra', () => {
    expect(parseReceptionRescheduleResult(DONE)).toStrictEqual(DONE);
    const extra = parseReceptionRescheduleResult({
      ...DONE,
      lyDo: 'x',
      lichHenId: '7',
      lichHenMoi: { ...DONE.lichHenMoi, id: '9' },
    });
    expect(extra).toStrictEqual(DONE);
  });

  it.each([
    [
      'ketQua DaGuiYeuCau (đổi hộ không có nhánh yêu cầu)',
      { ...DONE, ketQua: 'DaGuiYeuCau' },
    ],
    ['ketQua lạ', { ...DONE, ketQua: 'DaHuy' }],
    ['ketQua thiếu', without(DONE, 'ketQua')],
    ['thiếu lichHenMoi', without(DONE, 'lichHenMoi')],
    ['thiếu lichHenCu', without(DONE, 'lichHenCu')],
    ['thiếu thoiGianMayChu', without(DONE, 'thoiGianMayChu')],
    [
      'mã lịch mới sai dạng',
      { ...DONE, lichHenMoi: { ...DONE.lichHenMoi, maLichHen: '../x' } },
    ],
    [
      'mã lịch cũ sai dạng (có dấu cách)',
      { ...DONE, lichHenCu: { maLichHen: 'CP 1' } },
    ],
    [
      'mã lịch cũ quá dài',
      { ...DONE, lichHenCu: { maLichHen: 'A'.repeat(41) } },
    ],
    ['mã lịch cũ rỗng', { ...DONE, lichHenCu: { maLichHen: '' } }],
    [
      'thoiGian lịch mới sai',
      { ...DONE, lichHenMoi: { ...DONE.lichHenMoi, thoiGian: 'x' } },
    ],
    [
      'trangThai lịch mới là số',
      { ...DONE, lichHenMoi: { ...DONE.lichHenMoi, trangThai: 1 } },
    ],
    ['null', null],
    ['mảng', []],
    ['chuỗi', 'DaDoi'],
  ])('WDO-09 thân sai hình dạng (%s) ⇒ không dùng được', (_name, raw) => {
    expect(() => parseReceptionRescheduleResult(raw)).toThrow(
      UnexpectedResponseError,
    );
  });
});

describe('getReceptionReschedulePreview và submitReceptionReschedule (WDO-09)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setApiAuthHooks(null);
  });

  function stubFetch(response: Response | Error) {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    // Bản sao mỗi lần gọi: thân `Response` chỉ đọc được một lần
    const fetchMock = vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response.clone();
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  const firstCall = (fetchMock: ReturnType<typeof stubFetch>) =>
    fetchMock.mock.calls[0] as unknown as [string, RequestInit];

  it('WDO-09 GET: đường dẫn đã mã hoá, KHÔNG query khi không có `khungGioId`, gắn token, đọc qua bộ đọc NGHIÊM', async () => {
    const fetchMock = stubFetch(Response.json(PREVIEW));
    const parsed = await getReceptionReschedulePreview('CP 2026/10?x', null);
    expect(parsed).toStrictEqual(PREVIEW);
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe(
      '/api/reception/appointments/CP%202026%2F10%3Fx/reschedule-preview',
    );
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer token-gia',
    );
  });

  it('WDO-09 GET có `khungGioId`: id lớn hơn 2^53 đi NGUYÊN chuỗi trong query', async () => {
    const fetchMock = stubFetch(
      Response.json({ ...PREVIEW, lichMoi: NEW_SLOT }),
    );
    const parsed = await getReceptionReschedulePreview('A', '9007199254740993');
    expect(parsed.lichMoi?.khungGioId).toBe('9007199254740993');
    expect(firstCall(fetchMock)[0]).toBe(
      '/api/reception/appointments/A/reschedule-preview?khungGioId=9007199254740993',
    );
  });

  it('WDO-09 GET nhận `signal` (huỷ được khi rời trang); 200 sai hình dạng ⇒ UnexpectedResponseError', async () => {
    const fetchMock = stubFetch(Response.json({ ...PREVIEW, lichCu: null }));
    const controller = new AbortController();
    await expect(
      getReceptionReschedulePreview('A', null, controller.signal),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    expect(firstCall(fetchMock)[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('WDO-09 POST: đường dẫn đã mã hoá, thân CHỈ `khungGioId` và `lyDo` (đúng thứ tự khoá, id nguyên chuỗi), JSON, gắn token; KHÔNG `lyDoYeuCau`, `chiNhanhId`, `benhNhanId`', async () => {
    const fetchMock = stubFetch(Response.json(DONE, { status: 201 }));
    const result = await submitReceptionReschedule('CP 2026/10?x', {
      khungGioId: '9007199254740993',
      lyDo: 'Bác sĩ báo bận',
    });
    expect(result).toStrictEqual(DONE);
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe(
      '/api/reception/appointments/CP%202026%2F10%3Fx/reschedule',
    );
    expect(init.method).toBe('POST');
    expect(String(init.body)).toBe(
      '{"khungGioId":"9007199254740993","lyDo":"Bác sĩ báo bận"}',
    );
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-gia');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  // POST KHÔNG truyền `signal` của nơi gọi (yêu cầu đã gửi thì máy chủ vẫn xử lý dù trang bị gỡ, nếp hộp huỷ): `request()` luôn gắn bộ huỷ hạn 15 giây của riêng nó nên không phân biệt được ở đây;
  // điều đó được khoá bằng quét mã ở WDO-14 (`reception-reschedule-api.ts` không nhắc `signal` ở hàm gửi).
  it.each([
    [400, 'DU_LIEU_KHONG_HOP_LE'],
    [403, 'KHONG_DU_QUYEN'],
    [404, 'KHONG_TIM_THAY'],
    [404, 'KHUNG_GIO_KHONG_TON_TAI'],
    [409, 'LICH_HEN_KHONG_CHO_DOI'],
    [409, 'KHUNG_GIO_DA_DAT'],
    [409, 'HO_SO_NGUOI_THAN_DA_NGUNG'],
    [409, 'HE_THONG_CHUA_CAU_HINH'],
    [500, 'LOI_HE_THONG'],
    [503, 'HE_THONG_DANG_BAN'],
  ])(
    'WDO-09 POST %i %s ⇒ ApiError giữ `maLoi`, `loi[]` và `chiTiet`',
    async (status, maLoi) => {
      stubFetch(
        Response.json(
          {
            maLoi,
            thongBao: 'x',
            loi: [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
            chiTiet: { trangThai: 'DaDoiLich' },
          },
          { status },
        ),
      );
      const error = await submitReceptionReschedule('A', {
        khungGioId: '5',
        lyDo: 'x',
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        maLoi,
        status,
        loi: [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
        chiTiet: { trangThai: 'DaDoiLich' },
      });
    },
  );

  it('WDO-09 mất mạng ⇒ NetworkError; thân HTML 502 ⇒ UnexpectedResponseError; 201 sai hình dạng (kể cả `DaGuiYeuCau`) ⇒ UnexpectedResponseError (không trả dữ liệu dở)', async () => {
    const input = { khungGioId: '5', lyDo: 'x' };
    stubFetch(new TypeError('Failed to fetch'));
    await expect(submitReceptionReschedule('A', input)).rejects.toBeInstanceOf(
      NetworkError,
    );
    stubFetch(new Response('<html>502</html>', { status: 502 }));
    await expect(submitReceptionReschedule('A', input)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    stubFetch(Response.json({ ...DONE, lichHenCu: {} }, { status: 201 }));
    await expect(submitReceptionReschedule('A', input)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    stubFetch(
      Response.json({ ...DONE, ketQua: 'DaGuiYeuCau' }, { status: 201 }),
    );
    await expect(submitReceptionReschedule('A', input)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});
