import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  RequestAbortedError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { day, NGAY, rawResponse, slot } from '../slots/testing/slot-fixtures';
import { getDoctorSlots } from './search-service';

// search PR-C2, mã ca SLT-20 đến SLT-23: lời gọi `GET /public/doctor-slots` qua lớp API client duy nhất.
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

function stubFetch(
  respond: (input: string, init: RequestInit) => Promise<Response>,
) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    respond(String(input), init ?? {}),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('getDoctorSlots', () => {
  it('SLT-20 một lời gọi: bacSiIds ngăn dấu phẩy ĐÚNG thứ tự, ngay; không khoá khác, không Authorization (route công khai)', async () => {
    const mock = stubFetch(async () =>
      json(
        200,
        rawResponse(NGAY, [day('15'), day('12', [slot('901', '08:00')])]),
      ),
    );
    const result = await getDoctorSlots({ bacSiIds: ['15', '12'], ngay: NGAY });
    expect(mock).toHaveBeenCalledTimes(1);
    const [input, init] = mock.mock.calls[0];
    const url = new URL(String(input), 'http://localhost');
    expect(url.pathname).toBe('/api/public/doctor-slots');
    expect([...url.searchParams.keys()].sort()).toEqual(['bacSiIds', 'ngay']);
    expect(url.searchParams.get('bacSiIds')).toBe('15,12');
    expect(url.searchParams.get('ngay')).toBe(NGAY);
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    expect(result.get('12')?.khungGio).toHaveLength(1);
  });

  it('SLT-21 hết `signal` của nơi gọi thì dừng bằng RequestAbortedError (không phải lỗi hiển thị)', async () => {
    stubFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        ),
    );
    const controller = new AbortController();
    const pending = getDoctorSlots(
      { bacSiIds: ['12'], ngay: NGAY },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(RequestAbortedError);
  });

  it('SLT-22 400 BO_LOC_KHONG_HOP_LE giữ nguyên `loi[]` để giao diện phân biệt lỗi `ngay`', async () => {
    stubFetch(async () =>
      json(400, {
        maLoi: 'BO_LOC_KHONG_HOP_LE',
        thongBao: 'x',
        loi: [{ truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' }],
      }),
    );
    const error = await getDoctorSlots({ bacSiIds: ['12'], ngay: NGAY }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      maLoi: 'BO_LOC_KHONG_HOP_LE',
      loi: [{ truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' }],
    });
  });

  it('SLT-23 200 sai hình dạng (thiếu phần tử cho một id, hoặc ngày khác) ⇒ UnexpectedResponseError', async () => {
    stubFetch(async () => json(200, rawResponse(NGAY, [day('12')])));
    await expect(
      getDoctorSlots({ bacSiIds: ['12', '13'], ngay: NGAY }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    stubFetch(async () => json(200, rawResponse('2026-11-19', [day('12')])));
    await expect(
      getDoctorSlots({ bacSiIds: ['12'], ngay: NGAY }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
