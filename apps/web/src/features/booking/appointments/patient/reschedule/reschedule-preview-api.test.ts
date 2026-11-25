import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import {
  ApiError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import {
  getReschedulePreview,
  parseReschedulePreview,
} from './reschedule-preview-api';

// reschedule F1: bộ đọc NGHIÊM và lời gọi `GET /patient/appointments/:maLichHen/reschedule-preview` (PLAN reschedule 5.8; hợp đồng giả vì backend B6 chưa có, `lichCu.bacSiId` do Đại chốt
// 25/11/2026). Mã WDH-11, WDH-12, WDH-14 là [đề xuất] (PLAN 7.11). Dữ liệu giả.
const PREVIEW = {
  choPhepDoi: true,
  loai: 'TuDoi',
  soLanDaDoi: 1,
  soLanToiDa: 2,
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

const unusable = (raw: unknown) =>
  expect(() => parseReschedulePreview(raw)).toThrow(UnexpectedResponseError);
const without = <T extends object>(value: T, key: keyof T) => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};

describe('parseReschedulePreview', () => {
  it('WDH-11 đủ khoá, `lichMoi` null (chỉ hỏi điều kiện đổi) ⇒ giữ nguyên, id là chuỗi', () => {
    const parsed = parseReschedulePreview(PREVIEW);
    expect(parsed).toEqual(PREVIEW);
    expect(parsed.lichCu.bacSiId).toBe('12');
    expect('lyDoKhongDoi' in parsed).toBe(false);
  });

  it('WDH-11 `lichMoi` đủ khoá: id lớn hơn 2^53 giữ NGUYÊN chuỗi, `lyDoKhongHopLe` vắng hoặc chuỗi', () => {
    const valid = parseReschedulePreview({ ...PREVIEW, lichMoi: NEW_SLOT });
    expect(valid.lichMoi).toEqual(NEW_SLOT);
    expect(valid.lichMoi?.khungGioId).toBe('9007199254740993');

    const invalid = parseReschedulePreview({
      ...PREVIEW,
      lichMoi: {
        ...NEW_SLOT,
        hopLe: false,
        lyDoKhongHopLe: 'KHUNG_GIO_DA_DAT',
      },
    });
    expect(invalid.lichMoi).toEqual({
      ...NEW_SLOT,
      hopLe: false,
      lyDoKhongHopLe: 'KHUNG_GIO_DA_DAT',
    });
  });

  it('WDH-11 không đổi được: `lyDoKhongDoi` là chuỗi mã lỗi, `loai` GuiYeuCau và `coYeuCauChoDuyet` đọc đúng', () => {
    const parsed = parseReschedulePreview({
      ...PREVIEW,
      choPhepDoi: false,
      lyDoKhongDoi: 'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
      loai: 'GuiYeuCau',
      coYeuCauChoDuyet: true,
      soLanDaDoi: 2,
    });
    expect(parsed.choPhepDoi).toBe(false);
    expect(parsed.lyDoKhongDoi).toBe('DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET');
    expect(parsed.loai).toBe('GuiYeuCau');
    expect(parsed.coYeuCauChoDuyet).toBe(true);
  });

  it('WDH-11 `soLanToiDa` bằng 0 là hợp lệ (cấu hình 0 ⇒ mọi lần đổi là yêu cầu)', () => {
    expect(
      parseReschedulePreview({ ...PREVIEW, soLanToiDa: 0, soLanDaDoi: 0 })
        .soLanToiDa,
    ).toBe(0);
  });

  it('WDH-11 khoá thừa của API (id nội bộ, tên bệnh nhân) không lọt ra ở mọi cấp', () => {
    const parsed = parseReschedulePreview({
      ...PREVIEW,
      lichHenId: '77',
      benhNhanId: '5',
      lichCu: { ...PREVIEW.lichCu, khungGioId: '31', hoTen: 'LO_RA' },
      lichMoi: { ...NEW_SLOT, chiNhanhId: '4', ghiChu: 'LO_RA' },
    });
    expect(JSON.stringify(parsed)).not.toMatch(
      /lichHenId|benhNhanId|khungGioId":"31|chiNhanhId|LO_RA/,
    );
  });

  it('WDH-12 thiếu một khoá bắt buộc (kể cả `lichMoi`, vốn có thể null) ⇒ phản hồi không dùng được', () => {
    for (const key of [
      'choPhepDoi',
      'loai',
      'soLanDaDoi',
      'soLanToiDa',
      'coYeuCauChoDuyet',
      'lichCu',
      'lichMoi',
      'thoiGianMayChu',
    ] as const) {
      unusable(without(PREVIEW, key));
    }
  });

  it('WDH-12 thiếu khoá con của `lichCu` hay `lichMoi` ⇒ không dùng được', () => {
    unusable({ ...PREVIEW, lichCu: { bacSiId: '12' } });
    unusable({
      ...PREVIEW,
      lichCu: { thoiGian: PREVIEW.lichCu.thoiGian },
    });
    for (const key of ['khungGioId', 'thoiGian', 'hopLe'] as const) {
      unusable({ ...PREVIEW, lichMoi: without(NEW_SLOT, key) });
    }
  });

  it('WDH-12 sai kiểu hay sai hình dạng ⇒ không dùng được', () => {
    unusable(null);
    unusable([]);
    unusable('xem trước');
    unusable({ ...PREVIEW, choPhepDoi: 'true' });
    unusable({ ...PREVIEW, coYeuCauChoDuyet: 0 });
    unusable({ ...PREVIEW, loai: 'KhongRo' });
    unusable({ ...PREVIEW, loai: 'tudoi' });
    unusable({ ...PREVIEW, thoiGianMayChu: 'hôm qua' });
    unusable({ ...PREVIEW, lichCu: 'hôm qua' });
    unusable({ ...PREVIEW, lichCu: [] });
    unusable({ ...PREVIEW, lichCu: { ...PREVIEW.lichCu, thoiGian: 'sớm' } });
    unusable({ ...PREVIEW, lichMoi: 'trống' });
    unusable({ ...PREVIEW, lichMoi: [] });
    unusable({ ...PREVIEW, lichMoi: { ...NEW_SLOT, hopLe: 'có' } });
    unusable({ ...PREVIEW, lichMoi: { ...NEW_SLOT, thoiGian: '' } });
  });

  it('WDH-12 số đếm âm, không nguyên hay là chuỗi ⇒ không dùng được', () => {
    for (const bad of [-1, 1.5, '2', null, Number.NaN]) {
      unusable({ ...PREVIEW, soLanDaDoi: bad });
      unusable({ ...PREVIEW, soLanToiDa: bad });
    }
  });

  it('WDH-12 id sai dạng (số 0 đứng đầu, là số, rỗng, âm, có chữ) ở `bacSiId` và `khungGioId` ⇒ không dùng được', () => {
    for (const bad of ['007', 12, '', '-5', '1e5', ' 12', '12 ', 'abc']) {
      unusable({ ...PREVIEW, lichCu: { ...PREVIEW.lichCu, bacSiId: bad } });
      unusable({ ...PREVIEW, lichMoi: { ...NEW_SLOT, khungGioId: bad } });
    }
  });

  it('WDH-12 `lyDoKhongDoi` và `lyDoKhongHopLe` chỉ được vắng hoặc là chuỗi (số, null, đối tượng ⇒ không dùng được)', () => {
    for (const bad of [5, null, {}, [], true]) {
      unusable({ ...PREVIEW, lyDoKhongDoi: bad });
      unusable({
        ...PREVIEW,
        lichMoi: { ...NEW_SLOT, lyDoKhongHopLe: bad },
      });
    }
  });
});

describe('getReschedulePreview', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setApiAuthHooks(null);
  });

  function stubFetch(response: Response) {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    // Bản sao mỗi lần gọi: thân `Response` chỉ đọc được một lần
    const fetchMock = vi.fn(async () => response.clone());
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const firstCall = (fetchMock: ReturnType<typeof stubFetch>) =>
    fetchMock.mock.calls[0] as unknown as [string, RequestInit];

  it('WDH-14 GET đúng đường dẫn đã mã hoá, KHÔNG có query khi chưa chọn khung giờ, gắn token, không thân', async () => {
    const fetchMock = stubFetch(Response.json(PREVIEW));
    const preview = await getReschedulePreview('CP 2026/10?x', null);

    expect(preview.lichCu.bacSiId).toBe('12');
    const [url, init] = firstCall(fetchMock);
    expect(url).toBe(
      '/api/patient/appointments/CP%202026%2F10%3Fx/reschedule-preview',
    );
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer token-gia',
    );
    expect(init.body).toBeUndefined();
  });

  it('WDH-14 có khung giờ ⇒ `khungGioId` vào query nguyên vẹn (id lớn hơn 2^53 không qua Number)', async () => {
    const fetchMock = stubFetch(
      Response.json({ ...PREVIEW, lichMoi: NEW_SLOT }),
    );
    const preview = await getReschedulePreview('CP1', '9007199254740993');

    expect(firstCall(fetchMock)[0]).toBe(
      '/api/patient/appointments/CP1/reschedule-preview?khungGioId=9007199254740993',
    );
    expect(preview.lichMoi?.khungGioId).toBe('9007199254740993');
  });

  it('WDH-14 404, 403 và 409 ⇒ ApiError giữ `maLoi` và `chiTiet`; thân không phải JSON ⇒ UnexpectedResponseError', async () => {
    stubFetch(
      Response.json(
        { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' },
        { status: 404 },
      ),
    );
    await expect(getReschedulePreview('A', null)).rejects.toMatchObject({
      maLoi: 'KHONG_TIM_THAY',
      status: 404,
    });

    stubFetch(
      Response.json(
        { maLoi: 'KHONG_DU_QUYEN', thongBao: 'x' },
        { status: 403 },
      ),
    );
    await expect(getReschedulePreview('A', null)).rejects.toMatchObject({
      maLoi: 'KHONG_DU_QUYEN',
      status: 403,
    });

    stubFetch(
      Response.json(
        {
          maLoi: 'VUOT_SO_LAN_TU_DOI',
          thongBao: 'x',
          chiTiet: { soLanDaDoi: 2, toiDa: 2 },
        },
        { status: 409 },
      ),
    );
    const error = await getReschedulePreview('A', null).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      maLoi: 'VUOT_SO_LAN_TU_DOI',
      chiTiet: { soLanDaDoi: 2, toiDa: 2 },
    });

    stubFetch(new Response('<html>502</html>', { status: 502 }));
    await expect(getReschedulePreview('A', null)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });

  it('WDH-14 200 sai hình dạng (thiếu `lichCu.bacSiId`) ⇒ UnexpectedResponseError, không trả dữ liệu dở', async () => {
    stubFetch(
      Response.json({
        ...PREVIEW,
        lichCu: { thoiGian: PREVIEW.lichCu.thoiGian },
      }),
    );
    await expect(getReschedulePreview('A', null)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});
