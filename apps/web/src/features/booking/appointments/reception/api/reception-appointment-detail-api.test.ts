import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import { makeReceptionDetail } from '../../../testing/fake-reception-api';
import {
  getReceptionAppointment,
  parseReceptionAppointmentDetail,
  receptionAppointmentApiPath,
} from './reception-appointment-detail-api';

// booking F8: bộ đọc và lời gọi `GET /reception/appointments/:maLichHen`. Mã LTC là [đề xuất] (PLAN booking mục 7.34). Hợp đồng đọc từ mã backend B3 (TRACKING 3.28 F8-D):
// chi tiết ĐÚNG mười sáu khoá = mười một khoá của dòng cộng `lyDoKham`, `lyDoHuy`, `hanThanhToan`, `chuyenDuoc`, `conPhaiThu`.
const DETAIL_KEYS = [
  'bacSi',
  'chiNhanh',
  'chuyenDuoc',
  'chuyenKhoa',
  'conPhaiThu',
  'dichVu',
  'giaSnapshot',
  'hanThanhToan',
  'lyDoHuy',
  'lyDoKham',
  'maLichHen',
  'nguoiDat',
  'nguoiKham',
  'thoiGian',
  'tienCoc',
  'trangThai',
];

afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('parseReceptionAppointmentDetail', () => {
  it('LTC-05 giữ đúng mười sáu khoá và đúng kiểu', () => {
    const parsed = parseReceptionAppointmentDetail(
      makeReceptionDetail({
        trangThai: 'ChoThanhToan',
        hanThanhToan: '2026-10-18T01:15:00.000Z',
        chuyenDuoc: ['DaHuy'],
        conPhaiThu: null,
      }),
    );
    expect(Object.keys(parsed).sort()).toEqual(DETAIL_KEYS);
    expect(parsed.hanThanhToan).toBe('2026-10-18T01:15:00.000Z');
    expect(parsed.chuyenDuoc).toEqual(['DaHuy']);
    expect(parsed.conPhaiThu).toBeNull();
  });

  it('LTC-05 các khoá có thể `null` vẫn phải có mặt; `conPhaiThu` là chuỗi decimal, không tính toán', () => {
    const parsed = parseReceptionAppointmentDetail(
      makeReceptionDetail({
        lyDoKham: null,
        lyDoHuy: null,
        hanThanhToan: null,
        conPhaiThu: '200000.00',
      }),
    );
    expect(parsed.lyDoKham).toBeNull();
    expect(parsed.lyDoHuy).toBeNull();
    expect(parsed.hanThanhToan).toBeNull();
    expect(parsed.conPhaiThu).toBe('200000.00');

    const missing: Record<string, unknown> = { ...makeReceptionDetail() };
    for (const key of [
      'lyDoKham',
      'lyDoHuy',
      'hanThanhToan',
      'conPhaiThu',
      'chuyenDuoc',
    ]) {
      const body = { ...missing };
      delete body[key];
      expect(() => parseReceptionAppointmentDetail(body), key).toThrow(
        UnexpectedResponseError,
      );
    }
  });

  it('LTC-05 khoá thừa (thanhToan, email, id số) không được chép theo', () => {
    const parsed = parseReceptionAppointmentDetail({
      ...makeReceptionDetail(),
      thanhToan: { daThu: '1.00' },
      email: 'a@b.vn',
      lichHenId: '7',
      thoiGianMayChu: '2026-10-18T00:00:00.000Z',
    });
    expect(Object.keys(parsed).sort()).toEqual(DETAIL_KEYS);
  });

  it('LTC-05 `chuyenDuoc` phải là mảng chuỗi (rỗng là hợp lệ); sai hình dạng ⇒ không dùng được', () => {
    expect(
      parseReceptionAppointmentDetail(makeReceptionDetail({ chuyenDuoc: [] }))
        .chuyenDuoc,
    ).toEqual([]);
    // Mã lạ vẫn đi qua (reception-actions bỏ qua mã không phải ba đích của Lễ tân)
    expect(
      parseReceptionAppointmentDetail(
        makeReceptionDetail({ chuyenDuoc: ['HoanThanh', 'DaHuy'] }),
      ).chuyenDuoc,
    ).toEqual(['HoanThanh', 'DaHuy']);
    for (const bad of ['DaHuy', null, {}, [1], [null], [['DaHuy']]]) {
      expect(() =>
        parseReceptionAppointmentDetail({
          ...makeReceptionDetail(),
          chuyenDuoc: bad,
        }),
      ).toThrow(UnexpectedResponseError);
    }
  });

  it('LTC-05 số tiền và mốc giờ sai dạng ⇒ không dùng được', () => {
    for (const patch of [
      { conPhaiThu: 200000 },
      { conPhaiThu: '-1' },
      { conPhaiThu: '' },
      { hanThanhToan: 'chưa' },
      { lyDoKham: 5 },
      { lyDoHuy: 5 },
    ]) {
      expect(() =>
        parseReceptionAppointmentDetail({ ...makeReceptionDetail(), ...patch }),
      ).toThrow(UnexpectedResponseError);
    }
  });
});

describe('getReceptionAppointment', () => {
  it('LTC-01 GET /api/reception/appointments/:ma, mã được mã hoá (không có `/`, `?`, `#` trần), GẮN access token', async () => {
    expect(receptionAppointmentApiPath('CP20261018001')).toBe(
      'reception/appointments/CP20261018001',
    );
    expect(receptionAppointmentApiPath('A/B?c#d e')).toBe(
      'reception/appointments/A%2FB%3Fc%23d%20e',
    );

    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const spy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(makeReceptionDetail()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', spy);

    const detail = await getReceptionAppointment('CP20261018001');
    expect(detail.maLichHen).toBe('CP20261018001');
    const [input, init] = spy.mock.calls[0];
    expect(new URL(String(input), 'http://localhost').pathname).toBe(
      '/api/reception/appointments/CP20261018001',
    );
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer token-gia',
    );
  });
});
