import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import { makeReceptionAppointment } from '../../../testing/fake-reception-api';
import {
  buildReceptionListQuery,
  getReceptionAppointments,
  parseReceptionAppointment,
  parseReceptionAppointmentPage,
} from './reception-appointments-api';

// booking F8: bộ đọc và lời gọi `GET /reception/appointments`. Mã LTL là [đề xuất] (PLAN booking mục 7.34). Hợp đồng đọc từ mã backend B3 (TRACKING 3.28 F8-D): mỗi dòng đúng
// MƯỜI MỘT khoá, thân `{ items, total, page, pageSize }` KHÔNG có `demTheoTrangThai`.
const ROW_KEYS = [
  'bacSi',
  'chiNhanh',
  'chuyenKhoa',
  'dichVu',
  'giaSnapshot',
  'maLichHen',
  'nguoiDat',
  'nguoiKham',
  'thoiGian',
  'tienCoc',
  'trangThai',
];
const page = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
});

afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('parseReceptionAppointment', () => {
  it('LTL-11 giữ đúng mười một khoá và đúng kiểu (người khám khác người đặt)', () => {
    const row = makeReceptionAppointment({
      nguoiKham: { hoTen: 'Bùi Minh Khoa', laBanThan: false },
      nguoiDat: { hoTen: 'Lê Thị M', soDienThoai: '0912345678' },
    });
    const parsed = parseReceptionAppointment(row);
    expect(Object.keys(parsed).sort()).toEqual(ROW_KEYS);
    expect(parsed.nguoiKham).toEqual({
      hoTen: 'Bùi Minh Khoa',
      laBanThan: false,
    });
    expect(parsed.nguoiDat).toEqual({
      hoTen: 'Lê Thị M',
      soDienThoai: '0912345678',
    });
    expect(parsed.giaSnapshot).toBe('300000.00');
  });

  it('LTL-11 khoá thừa của API không được chép theo (không email, id số, `chuyenDuoc`, `conPhaiThu`)', () => {
    const parsed = parseReceptionAppointment({
      ...makeReceptionAppointment(),
      lichHenId: '7',
      email: 'a@b.vn',
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: '1.00',
      hanThanhToan: null,
    });
    expect(Object.keys(parsed).sort()).toEqual(ROW_KEYS);
  });

  it('LTL-11 thiếu từng khoá, hoặc sai kiểu ⇒ phản hồi không dùng được (UnexpectedResponseError)', () => {
    for (const key of ROW_KEYS) {
      const row: Record<string, unknown> = { ...makeReceptionAppointment() };
      delete row[key];
      expect(() => parseReceptionAppointment(row), key).toThrow(
        UnexpectedResponseError,
      );
    }
    const bad: Record<string, unknown>[] = [
      { thoiGian: 'không phải ngày' },
      { giaSnapshot: '-5' },
      { giaSnapshot: 300000 },
      { tienCoc: null },
      { maLichHen: '' },
      { nguoiDat: null },
      { nguoiDat: { hoTen: 'A' } },
      { nguoiDat: { soDienThoai: '0900000000' } },
      { nguoiKham: { hoTen: 'A', laBanThan: 'true' } },
    ];
    for (const patch of bad) {
      expect(
        () =>
          parseReceptionAppointment({
            ...makeReceptionAppointment(),
            ...patch,
          }),
        JSON.stringify(patch),
      ).toThrow(UnexpectedResponseError);
    }
  });

  it('LTL-11 mã trạng thái lạ vẫn đi qua (hiện "Chưa xác định" ở giao diện), không làm vỡ phản hồi', () => {
    expect(
      parseReceptionAppointment(
        makeReceptionAppointment({ trangThai: 'DaDoiLich' }),
      ).trangThai,
    ).toBe('DaDoiLich');
  });
});

describe('parseReceptionAppointmentPage', () => {
  it('LTL-11 thân đúng bốn khoá; KHÔNG có `demTheoTrangThai` (B3: không có thẻ lọc số đếm)', () => {
    const parsed = parseReceptionAppointmentPage({
      ...page([makeReceptionAppointment()]),
      demTheoTrangThai: { DaXacNhan: 1 },
    });
    expect(Object.keys(parsed).sort()).toEqual([
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    expect(parsed.items).toHaveLength(1);
  });

  it('LTL-11 thân sai hình dạng (thiếu khoá, `items` không phải mảng, số sai) ⇒ không dùng được', () => {
    const good = page([makeReceptionAppointment()]);
    for (const key of ['items', 'total', 'page', 'pageSize'] as const) {
      const body: Record<string, unknown> = { ...good };
      delete body[key];
      expect(() => parseReceptionAppointmentPage(body), key).toThrow(
        UnexpectedResponseError,
      );
    }
    for (const patch of [
      { items: {} },
      { total: -1 },
      { total: '1' },
      { page: 0 },
      { pageSize: 0 },
      { pageSize: 1.5 },
    ]) {
      expect(() =>
        parseReceptionAppointmentPage({ ...good, ...patch }),
      ).toThrow(UnexpectedResponseError);
    }
    for (const body of [null, [], 'x', 1]) {
      expect(() => parseReceptionAppointmentPage(body)).toThrow(
        UnexpectedResponseError,
      );
    }
    // Một dòng hỏng làm hỏng cả trang (không hiện nửa vời)
    expect(() =>
      parseReceptionAppointmentPage(
        page([makeReceptionAppointment(), { maLichHen: 'CP1' }]),
      ),
    ).toThrow(UnexpectedResponseError);
  });

  it('LTL-11 trang rỗng hợp lệ (items rỗng, total 0)', () => {
    expect(parseReceptionAppointmentPage(page([]))).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });
});

describe('buildReceptionListQuery', () => {
  it('LTL-13 chỉ gửi `page` khi không có bộ lọc; bộ lọc rỗng hay chưa chọn thì KHÔNG gửi (`q=` rỗng là 400 của B3)', () => {
    expect(buildReceptionListQuery({ page: 1 })).toEqual({ page: 1 });
    expect(
      buildReceptionListQuery({
        page: 2,
        trangThai: undefined,
        chuyenKhoaId: '',
        bacSiId: '',
        tuNgay: '',
        denNgay: '',
        q: '',
      }),
    ).toEqual({ page: 2 });
  });

  it('LTL-13 gửi đúng các khoá B3 nhận, giá trị nguyên là chuỗi (id lớn hơn 2^53 không qua Number); không `dichVuKhamId`, `chiNhanhId`, `pageSize`', () => {
    const query = buildReceptionListQuery({
      page: 3,
      trangThai: 'DaXacNhan',
      chuyenKhoaId: '9007199254740993',
      bacSiId: '12',
      tuNgay: '2026-10-12',
      denNgay: '2026-10-18',
      q: 'Nguyễn',
    });
    expect(query).toEqual({
      page: 3,
      trangThai: 'DaXacNhan',
      chuyenKhoaId: '9007199254740993',
      bacSiId: '12',
      tuNgay: '2026-10-12',
      denNgay: '2026-10-18',
      q: 'Nguyễn',
    });
    for (const banned of ['dichVuKhamId', 'chiNhanhId', 'pageSize', 'nhom']) {
      expect(query).not.toHaveProperty(banned);
    }
  });
});

describe('getReceptionAppointments', () => {
  it('LTL-13 GET /api/reception/appointments kèm query và GẮN access token (route của Lễ tân)', async () => {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const spy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(page([makeReceptionAppointment()])), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', spy);

    const result = await getReceptionAppointments({
      page: 2,
      q: 'ab',
      tuNgay: '2026-10-18',
    });
    expect(result.items).toHaveLength(1);
    const url = new URL(String(spy.mock.calls[0][0]), 'http://localhost');
    expect(url.pathname).toBe('/api/reception/appointments');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2',
      q: 'ab',
      tuNgay: '2026-10-18',
    });
    expect(
      new Headers(spy.mock.calls[0][1]?.headers).get('Authorization'),
    ).toBe('Bearer token-gia');
    expect(spy.mock.calls[0][1]?.method ?? 'GET').toBe('GET');
  });
});
