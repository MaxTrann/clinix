import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import {
  ApiError,
  NetworkError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import {
  parseRescheduleResult,
  submitReschedule,
} from './reschedule-submit-api';

// reschedule F2: bộ đọc NGHIÊM hai dạng 201 và lời gọi `POST /patient/appointments/:maLichHen/reschedule` (PLAN reschedule 5.8; hợp đồng THẬT của B6: TRACKING mục 7). Mã WDH-29 (`DaDoi`),
// WDH-30 (`DaGuiYeuCau`), WDH-31 (lời gọi) là [đề xuất]. Dữ liệu giả.
const DONE = {
  ketQua: 'DaDoi',
  lichHenMoi: {
    maLichHen: 'CP20261020002',
    thoiGian: '2026-12-02T03:00:00.000Z',
    trangThai: 'DaXacNhan',
  },
  lichHenCu: { maLichHen: 'CP20261020001' },
  thoiGianMayChu: '2026-11-25T03:00:00.123Z',
};
const REQUESTED = {
  ketQua: 'DaGuiYeuCau',
  yeuCau: {
    trangThai: 'ChoDuyet',
    thoiGianMongMuon: '2026-12-02T03:00:00.000Z',
  },
  thoiGianMayChu: '2026-11-25T03:00:00.123Z',
};

const unusable = (raw: unknown) =>
  expect(() => parseRescheduleResult(raw)).toThrow(UnexpectedResponseError);
const without = (body: Record<string, unknown>, key: string) => {
  const copy = { ...body };
  delete copy[key];
  return copy;
};

describe('parseRescheduleResult, dạng DaDoi', () => {
  it('WDH-29 đủ khoá ⇒ giữ nguyên (mã lịch mới và cũ, giờ, trạng thái, giờ máy chủ)', () => {
    expect(parseRescheduleResult(DONE)).toStrictEqual(DONE);
  });

  it('WDH-29 khoá thừa (id nội bộ, tên) không lọt ra ở mọi cấp', () => {
    const parsed = parseRescheduleResult({
      ...DONE,
      lichHenId: '77',
      lichHenMoi: { ...DONE.lichHenMoi, lichHenId: '78', hoTen: 'Tên thật' },
      lichHenCu: { ...DONE.lichHenCu, benhNhanId: '5' },
    });
    expect(parsed).toStrictEqual(DONE);
  });

  it.each([
    ['ketQua', 'ketQua'],
    ['lichHenMoi', 'lichHenMoi'],
    ['lichHenCu', 'lichHenCu'],
    ['thoiGianMayChu', 'thoiGianMayChu'],
  ])('WDH-29 thiếu khoá %s ⇒ phản hồi không dùng được', (_name, key) => {
    unusable(without(DONE, key));
  });

  it.each(['maLichHen', 'thoiGian', 'trangThai'])(
    'WDH-29 thiếu `lichHenMoi.%s` ⇒ không dùng được',
    (key) => {
      unusable({ ...DONE, lichHenMoi: without(DONE.lichHenMoi, key) });
    },
  );

  it('WDH-29 thiếu `lichHenCu.maLichHen` ⇒ không dùng được', () => {
    unusable({ ...DONE, lichHenCu: {} });
  });

  it.each([
    ['mã lịch rỗng', ''],
    ['mã lịch có dấu cách', 'CP 1'],
    ['mã lịch có dấu gạch chéo', 'CP/1'],
    ['mã lịch quá dài', 'A'.repeat(41)],
    ['mã lịch là số', 123],
    ['mã lịch null', null],
  ])(
    'WDH-29 %s ở `lichHenMoi` ⇒ không dùng được (mã đi vào URL điều hướng)',
    (_n, bad) => {
      unusable({ ...DONE, lichHenMoi: { ...DONE.lichHenMoi, maLichHen: bad } });
    },
  );

  it.each([
    ['giờ không phải ISO', 'mai 9 giờ'],
    ['giờ là số', 1764644400000],
  ])('WDH-29 %s ⇒ không dùng được', (_name, bad) => {
    unusable({ ...DONE, lichHenMoi: { ...DONE.lichHenMoi, thoiGian: bad } });
    unusable({ ...DONE, thoiGianMayChu: bad });
  });

  it('WDH-29 `trangThai` không phải chuỗi ⇒ không dùng được', () => {
    unusable({ ...DONE, lichHenMoi: { ...DONE.lichHenMoi, trangThai: 3 } });
  });
});

describe('parseRescheduleResult, dạng DaGuiYeuCau và lỗi hình dạng chung', () => {
  it('WDH-30 đủ khoá ⇒ giữ nguyên', () => {
    expect(parseRescheduleResult(REQUESTED)).toStrictEqual(REQUESTED);
  });

  it('WDH-30 KHÔNG có `yeuCauId`: nếu máy chủ lỡ trả khoá này (hay khoá lạ nào) thì kết quả không chứa nó', () => {
    const parsed = parseRescheduleResult({
      ...REQUESTED,
      yeuCauId: '99',
      yeuCau: { ...REQUESTED.yeuCau, yeuCauId: '99', ghiChuXuLy: 'x' },
    });
    expect(parsed).toStrictEqual(REQUESTED);
    expect(JSON.stringify(parsed)).not.toContain('99');
  });

  it.each(['yeuCau', 'thoiGianMayChu', 'ketQua'])(
    'WDH-30 thiếu khoá %s ⇒ không dùng được',
    (key) => {
      unusable(without(REQUESTED, key));
    },
  );

  it.each(['trangThai', 'thoiGianMongMuon'])(
    'WDH-30 thiếu `yeuCau.%s` ⇒ không dùng được',
    (key) => {
      unusable({ ...REQUESTED, yeuCau: without(REQUESTED.yeuCau, key) });
    },
  );

  it.each(['TuChoi', 'DaDuyet', 'choduyet', '', 'ChoDuyet '])(
    'WDH-30 `yeuCau.trangThai` = %j (khác đúng "ChoDuyet") ⇒ không dùng được',
    (state) => {
      unusable({
        ...REQUESTED,
        yeuCau: { ...REQUESTED.yeuCau, trangThai: state },
      });
    },
  );

  it('WDH-30 giờ mong muốn không phải ISO ⇒ không dùng được', () => {
    unusable({
      ...REQUESTED,
      yeuCau: { ...REQUESTED.yeuCau, thoiGianMongMuon: 'sáng mai' },
    });
  });

  it.each([
    ['ketQua lạ', { ...DONE, ketQua: 'DaHuy' }],
    ['ketQua sai chữ hoa', { ...DONE, ketQua: 'dadoi' }],
    ['ketQua là số', { ...DONE, ketQua: 1 }],
    ['null', null],
    ['mảng', []],
    ['chuỗi', 'DaDoi'],
    ['số', 201],
    ['đối tượng rỗng', {}],
  ])('WDH-29 thân sai hình dạng (%s) ⇒ không dùng được', (_name, raw) => {
    unusable(raw);
  });

  it('WDH-29 thân có khoá của dạng này nhưng `ketQua` của dạng kia ⇒ không dùng được (không đoán dạng)', () => {
    unusable({ ...DONE, ketQua: 'DaGuiYeuCau' });
    unusable({ ...REQUESTED, ketQua: 'DaDoi' });
  });
});

describe('submitReschedule', () => {
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

  it('WDH-31 POST đúng đường dẫn đã mã hoá, thân CHỈ `khungGioId` khi không có lý do, JSON, gắn token', async () => {
    const fetchMock = stubFetch(Response.json(DONE, { status: 201 }));
    const result = await submitReschedule('CP 2026/10?x', {
      khungGioId: '55',
    });

    expect(result).toStrictEqual(DONE);
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe('/api/patient/appointments/CP%202026%2F10%3Fx/reschedule');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toStrictEqual({ khungGioId: '55' });
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-gia');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('WDH-31 có lý do ⇒ thân có `lyDoYeuCau` đúng chữ; id lớn hơn 2^53 đi NGUYÊN chuỗi (không qua Number)', async () => {
    const fetchMock = stubFetch(Response.json(REQUESTED, { status: 201 }));
    const result = await submitReschedule('A', {
      khungGioId: '9007199254740993',
      lyDoYeuCau: 'Có việc đột xuất',
    });

    expect(result).toStrictEqual(REQUESTED);
    const [, init] = firstCall(fetchMock);
    expect(String(init.body)).toContain('"khungGioId":"9007199254740993"');
    expect(JSON.parse(String(init.body))).toStrictEqual({
      khungGioId: '9007199254740993',
      lyDoYeuCau: 'Có việc đột xuất',
    });
  });

  it('WDH-31 `lyDoYeuCau: undefined` KHÔNG vào thân (khoá vắng, không `null`)', async () => {
    const fetchMock = stubFetch(Response.json(DONE, { status: 201 }));
    await submitReschedule('A', { khungGioId: '5', lyDoYeuCau: undefined });
    const [, init] = firstCall(fetchMock);
    expect(String(init.body)).toBe('{"khungGioId":"5"}');
  });

  it.each([
    [400, 'DU_LIEU_KHONG_HOP_LE'],
    [403, 'KHONG_DU_QUYEN'],
    [404, 'KHONG_TIM_THAY'],
    [409, 'VUOT_SO_LAN_TU_DOI'],
    [409, 'KHUNG_GIO_DA_DAT'],
    [409, 'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET'],
    [409, 'HE_THONG_CHUA_CAU_HINH'],
    [503, 'HE_THONG_DANG_BAN'],
  ])(
    'WDH-31 %i %s ⇒ ApiError giữ `maLoi`, `loi[]` và `chiTiet`',
    async (status, maLoi) => {
      stubFetch(
        Response.json(
          {
            maLoi,
            thongBao: 'x',
            loi: [{ truong: 'lyDoYeuCau', ma: 'IS_STRING' }],
            chiTiet: { soLanDaDoi: 2, toiDa: 2 },
          },
          { status },
        ),
      );
      const error = await submitReschedule('A', { khungGioId: '5' }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        maLoi,
        status,
        loi: [{ truong: 'lyDoYeuCau', ma: 'IS_STRING' }],
        chiTiet: { soLanDaDoi: 2, toiDa: 2 },
      });
    },
  );

  it('WDH-31 mất mạng ⇒ NetworkError; thân HTML 502 ⇒ UnexpectedResponseError; 201 sai hình dạng ⇒ UnexpectedResponseError (không trả dữ liệu dở)', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    await expect(
      submitReschedule('A', { khungGioId: '5' }),
    ).rejects.toBeInstanceOf(NetworkError);

    stubFetch(new Response('<html>502</html>', { status: 502 }));
    await expect(
      submitReschedule('A', { khungGioId: '5' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);

    stubFetch(Response.json({ ...DONE, lichHenCu: {} }, { status: 201 }));
    await expect(
      submitReschedule('A', { khungGioId: '5' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
