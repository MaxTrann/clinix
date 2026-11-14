import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  createFakeBookingApi,
  makeCheckResult,
  makeCreatedDone,
} from '../testing/fake-booking-api';
import { installFakeFetch } from '../testing/install-fake-fetch';
import { createAppointment, postCheckConfirmation } from './booking-service';

// booking F5. XNR-04 là [đề xuất] (PLAN booking mục 7.40): `POST /booking/appointments` của client. KHÔNG idempotent: mỗi lần gọi đúng MỘT `fetch`, không bao giờ tự gửi lại.
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const CREATE = { method: 'POST', path: '/booking/appointments' };

let api: ReturnType<typeof createFakeBookingApi>;

beforeEach(() => {
  api = createFakeBookingApi(async () => new Response('', { status: 404 }));
  installFakeFetch(api.fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('booking F5 — client tạo lịch hẹn (XNR-04)', () => {
  it('XNR-04 WZ-12 một POST tới booking/appointments, thân ĐÚNG ba khoá; bản thân `hoSoNguoiThanId: null` và không lý do `lyDoKham: null` (KHÔNG chuỗi rỗng)', async () => {
    const created = await createAppointment({
      khungGioId: '5',
      hoSoNguoiThanId: null,
      lyDoKham: null,
    });
    expect(api.requests).toEqual([CREATE]);
    expect(api.createBodies).toStrictEqual([
      { khungGioId: '5', hoSoNguoiThanId: null, lyDoKham: null },
    ]);
    expect(Object.keys(api.createBodies[0]).sort()).toEqual([
      'hoSoNguoiThanId',
      'khungGioId',
      'lyDoKham',
    ]);
    expect(created.maLichHen).toBe('CLX-20261019-7K3M9');
    expect(created.canThanhToan).toBe(true);
  });

  it('XNR-04 id lớn hơn 2^53 và lý do khám đi nguyên vẹn; 201 cọc 0đ đọc được', async () => {
    api.created = makeCreatedDone();
    const created = await createAppointment({
      khungGioId: '9223372036854775807',
      hoSoNguoiThanId: '9007199254740993',
      lyDoKham: 'đau lưng 2 tuần\nkhó ngủ',
    });
    expect(api.createBodies[0]).toStrictEqual({
      khungGioId: '9223372036854775807',
      hoSoNguoiThanId: '9007199254740993',
      lyDoKham: 'đau lưng 2 tuần\nkhó ngủ',
    });
    expect(created.canThanhToan).toBe(false);
    expect(created.trangThai).toBe('DaXacNhan');
  });

  it('XNR-04 WZ-13 KHÔNG tự gửi lại: lỗi mạng, 503, 500 và 401 đều đúng MỘT POST', async () => {
    const body = { khungGioId: '5', hoSoNguoiThanId: null, lyDoKham: null };
    api.failCreateNext(() => {
      throw new TypeError('fetch failed');
    });
    await expect(createAppointment(body)).rejects.toBeInstanceOf(NetworkError);
    expect(api.count('POST', '/booking/appointments')).toBe(1);

    api.failCreateNext(() =>
      json(503, { maLoi: 'HE_THONG_DANG_BAN', thongBao: 'bận' }),
    );
    await expect(createAppointment(body)).rejects.toMatchObject({
      status: 503,
      maLoi: 'HE_THONG_DANG_BAN',
    });
    expect(api.count('POST', '/booking/appointments')).toBe(2);

    api.failCreateNext(() =>
      json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'lỗi' }),
    );
    await expect(createAppointment(body)).rejects.toBeInstanceOf(ApiError);
    expect(api.count('POST', '/booking/appointments')).toBe(3);

    // 401: `request()` chỉ thử lại khi hook phục hồi trả true (ở đây false), nên vẫn một POST mỗi lần gọi
    api.failCreateNext(() =>
      json(401, { maLoi: 'CHUA_DANG_NHAP', thongBao: 'hết phiên' }),
    );
    await expect(createAppointment(body)).rejects.toMatchObject({
      status: 401,
    });
    expect(api.count('POST', '/booking/appointments')).toBe(4);
  });

  it('XNR-04 WZ-13 201 sai hình dạng ⇒ UnexpectedResponseError (không coi là thành công, không chuyển bước)', async () => {
    api.created = { maLichHen: 'CLX-20261019-7K3M9' };
    await expect(
      createAppointment({
        khungGioId: '5',
        hoSoNguoiThanId: null,
        lyDoKham: null,
      }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    expect(api.count('POST', '/booking/appointments')).toBe(1);
  });

  it('XNR-04 chờ tối đa 45 giây (không phải 15): phản hồi về sau 20 giây vẫn thành công; sau 45 giây là TimeoutError', async () => {
    vi.useFakeTimers();
    const body = { khungGioId: '5', hoSoNguoiThanId: null, lyDoKham: null };

    api.failCreateNext(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(json(201, api.created)), 20_000);
        }),
    );
    const slow = createAppointment(body);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(slow).resolves.toMatchObject({
      maLichHen: 'CLX-20261019-7K3M9',
    });

    api.failCreateNext(
      (init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('hết giờ', 'AbortError')),
          );
        }),
    );
    const stuck = createAppointment(body);
    const outcome = expect(stuck).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(45_000);
    await outcome;
  });

  it('XNR-04 postCheckConfirmation: cùng POST tới booking/checks, thân ĐÚNG hai khoá (không `lyDoKham`), đọc đủ 12 khoá', async () => {
    api.check = makeCheckResult({ soDuVi: '350000.00' });
    const result = await postCheckConfirmation('5', '101');
    expect(api.requests).toEqual([{ method: 'POST', path: '/booking/checks' }]);
    expect(api.checkBodies).toStrictEqual([
      { khungGioId: '5', hoSoNguoiThanId: '101' },
    ]);
    expect(result.soDuVi).toBe('350000.00');
    expect(result.giaApDung).toBe('300000.00');
  });
});
