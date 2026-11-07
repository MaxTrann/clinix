import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { hang, json } from '../testing/fake-profile-api';
import {
  BLOCKED_ERROR_CODE,
  deactivateRelative,
  parseBlockingAppointments,
} from './relatives-service';

// patient F7 (TRACKING F7-G, F7-H): `deactivateRelative` và đọc `chiTiet` của 409. Mã ca DW-nn là [đề xuất]; mỗi ca ghi mã NT của PLAN 7.2.
const LICH_1 = {
  maLichHen: 'LH-0001',
  thoiGian: '2026-11-02T01:00:00.000Z',
  trangThai: 'DaXacNhan',
  bacSi: 'Bác sĩ Mẫu Một',
  chiNhanh: 'Chi nhánh Mẫu',
};
const LICH_2 = {
  maLichHen: 'LH-0002',
  thoiGian: '2026-11-05T08:30:00.000Z',
  trangThai: 'ChoThanhToan',
  bacSi: 'Bác sĩ Mẫu Hai',
  chiNhanh: 'Chi nhánh Mẫu Hai',
};
const LICH_3 = { ...LICH_1, maLichHen: 'LH-0003', trangThai: 'DaTiepDon' };
const KEYS = ['bacSi', 'chiNhanh', 'maLichHen', 'thoiGian', 'trangThai'];

const row = (label: string, raw: unknown): [string, unknown] => [label, raw];
const conflict = (chiTiet: unknown) =>
  json(409, { maLoi: BLOCKED_ERROR_CODE, thongBao: 'câu của API', chiTiet });

describe('parseBlockingAppointments', () => {
  it('DW-08 NT-23 đúng năm khoá, giữ nguyên thứ tự máy chủ, giữ nguyên chuỗi thời gian', () => {
    const parsed = parseBlockingAppointments([LICH_2, LICH_1, LICH_3]);
    expect(parsed.map((item) => item.maLichHen)).toEqual([
      'LH-0002',
      'LH-0001',
      'LH-0003',
    ]);
    expect(parsed[0]).toEqual(LICH_2);
    expect(Object.keys(parsed[0]).sort()).toEqual(KEYS);
  });

  it('DW-09 NT-23 khoá thừa bị BỎ (không bao giờ vào giao diện)', () => {
    const [item] = parseBlockingAppointments([
      {
        ...LICH_1,
        lichHenId: '99',
        benhNhanId: '5',
        lyDoKham: 'riêng tư',
        thongBao: 'câu của API',
      },
    ]);
    expect(item).toEqual(LICH_1);
    expect(Object.keys(item).sort()).toEqual(KEYS);
  });

  it('DW-10 NT-23 mã trạng thái lạ KHÔNG làm vỡ (vẫn là chuỗi)', () => {
    expect(
      parseBlockingAppointments([{ ...LICH_1, trangThai: 'MaLa' }])[0]
        .trangThai,
    ).toBe('MaLa');
  });

  it.each<[string, unknown]>([
    ['không có (undefined)', undefined],
    ['null', null],
    ['chuỗi', 'LH-0001'],
    ['đối tượng', { ...LICH_1 }],
    ['số', 1],
    ['mảng rỗng', []],
    ['phần tử null', [null]],
    ['phần tử là chuỗi', ['LH-0001']],
    ['phần tử là mảng', [[LICH_1]]],
    ['một phần tử sai ở giữa', [LICH_1, { ...LICH_2, bacSi: 5 }, LICH_3]],
    ...KEYS.map((key) =>
      row(`thiếu ${key}`, [{ ...LICH_1, [key]: undefined }]),
    ),
    ...KEYS.map((key) => row(`${key} là null`, [{ ...LICH_1, [key]: null }])),
    ...KEYS.map((key) => row(`${key} là số`, [{ ...LICH_1, [key]: 7 }])),
    ['thoiGian dd/mm/yyyy', [{ ...LICH_1, thoiGian: '02/11/2026 08:00' }]],
    ['thoiGian chỉ có ngày', [{ ...LICH_1, thoiGian: '2026-11-02' }]],
    ['thoiGian không phải ngày', [{ ...LICH_1, thoiGian: 'không phải ngày' }]],
    ['thoiGian tháng 13', [{ ...LICH_1, thoiGian: '2026-13-02T01:00:00Z' }]],
  ])(
    'DW-11 NT-23 chiTiet sai hình dạng (%s) ⇒ UnexpectedResponseError',
    (_label, raw) => {
      expect(() => parseBlockingAppointments(raw)).toThrow(
        UnexpectedResponseError,
      );
    },
  );
});

describe('deactivateRelative: gọi API qua lớp client', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stub(response: Response | (() => Response | Promise<Response>)) {
    const fetchMock = vi.fn(async () =>
      typeof response === 'function' ? response() : response,
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  const lastCall = (fetchMock: ReturnType<typeof stub>) =>
    fetchMock.mock.calls[0] as unknown as [string, RequestInit];

  it('DW-12 NT-23 POST /api/patient/relatives/:id/deactivate, KHÔNG thân, không Content-Type, id lớn hơn 2^53 đi nguyên vẹn', async () => {
    const fetchMock = stub(json(200, { trangThaiHieuLuc: false }));
    await deactivateRelative('9007199254740993');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/patient/relatives/9007199254740993/deactivate');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('DW-13 NT-23 200 { trangThaiHieuLuc: false } ⇒ { kind: "done" }', async () => {
    stub(json(200, { trangThaiHieuLuc: false }));
    await expect(deactivateRelative('1')).resolves.toEqual({ kind: 'done' });
  });

  it('DW-13b NT-23 200 có thêm khoá lạ vẫn là done (chỉ khoá trangThaiHieuLuc được kiểm)', async () => {
    stub(json(200, { trangThaiHieuLuc: false, ghiChu: 'x' }));
    await expect(deactivateRelative('1')).resolves.toEqual({ kind: 'done' });
  });

  it.each([
    ['thân rỗng', () => new Response('', { status: 200 })],
    ['null', () => json(200, null)],
    ['mảng', () => json(200, [])],
    ['{ ok: true }', () => json(200, { ok: true })],
    ['trangThaiHieuLuc true', () => json(200, { trangThaiHieuLuc: true })],
    [
      'trangThaiHieuLuc là chuỗi',
      () => json(200, { trangThaiHieuLuc: 'false' }),
    ],
    ['trangThaiHieuLuc là null', () => json(200, { trangThaiHieuLuc: null })],
  ])(
    'DW-14 NT-23 200 sai thân (%s) ⇒ UnexpectedResponseError, không coi là đã ngừng',
    async (_label, make) => {
      stub(make);
      await expect(deactivateRelative('1')).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
    },
  );

  it('DW-15 NT-23 409 HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN ⇒ { kind: "blocked" } với danh sách đã parse, đúng thứ tự', async () => {
    stub(conflict([LICH_1, LICH_2, LICH_3]));
    const outcome = await deactivateRelative('1');

    expect(outcome).toEqual({
      kind: 'blocked',
      appointments: [LICH_1, LICH_2, LICH_3],
    });
  });

  it.each([
    [
      'thiếu chiTiet',
      () => json(409, { maLoi: BLOCKED_ERROR_CODE, thongBao: 'x' }),
    ],
    ['chiTiet rỗng', () => conflict([])],
    ['chiTiet không phải mảng', () => conflict({ ...LICH_1 })],
    [
      'một phần tử thiếu khoá',
      () => conflict([{ ...LICH_1, bacSi: undefined }]),
    ],
    ['thoiGian không hợp lệ', () => conflict([{ ...LICH_1, thoiGian: 'abc' }])],
  ])(
    'DW-16 NT-23 409 có chiTiet sai hình dạng (%s) ⇒ UnexpectedResponseError',
    async (_label, make) => {
      stub(make);
      await expect(deactivateRelative('1')).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
    },
  );

  it('DW-17 NT-23 409 mã khác (HO_SO_NGUOI_THAN_DA_NGUNG) KHÔNG phải "blocked": ném lại ApiError nguyên', async () => {
    stub(
      json(409, {
        maLoi: 'HO_SO_NGUOI_THAN_DA_NGUNG',
        thongBao: 'x',
        chiTiet: [LICH_1],
      }),
    );
    await expect(deactivateRelative('1')).rejects.toMatchObject({
      status: 409,
      maLoi: 'HO_SO_NGUOI_THAN_DA_NGUNG',
    });
  });

  it.each([
    [404, 'KHONG_TIM_THAY'],
    [500, 'LOI_HE_THONG'],
    [403, 'KHONG_DU_QUYEN'],
  ])(
    'DW-18 NT-23 %i %s ⇒ ném ApiError cho nơi gọi phân loại',
    async (status, maLoi) => {
      stub(json(status, { maLoi, thongBao: 'x' }));
      const error = await deactivateRelative('1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).maLoi).toBe(maLoi);
    },
  );

  it('DW-19 NT-23 mất mạng ⇒ NetworkError; phản hồi HTML ⇒ UnexpectedResponseError; đều KHÔNG tự thử lại', async () => {
    const network = stub(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(deactivateRelative('1')).rejects.toBeInstanceOf(NetworkError);
    expect(network).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    const html = stub(
      new Response('<html>502</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    await expect(deactivateRelative('1')).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    expect(html).toHaveBeenCalledTimes(1);
  });

  it('DW-20 NT-23 quá giờ chờ ⇒ TimeoutError, một yêu cầu', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) =>
      hang(init),
    );
    vi.stubGlobal('fetch', fetchMock);
    const pending = deactivateRelative('1').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(16_000);

    expect(await pending).toBeInstanceOf(TimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
