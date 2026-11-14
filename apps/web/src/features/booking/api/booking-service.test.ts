import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  RequestAbortedError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  createFakeBookingApi,
  makeRelative,
} from '../testing/fake-booking-api';
import { installFakeFetch } from '../testing/install-fake-fetch';
import { getRelatives, postCheck } from './booking-service';

// booking F4. BRD-04 là [đề xuất] (PLAN booking mục 7.38): đường dẫn, phương thức, thân yêu cầu và `signal` của hai lời gọi mới.
let api: ReturnType<typeof createFakeBookingApi>;

beforeEach(() => {
  api = createFakeBookingApi(async () => new Response('', { status: 404 }));
  installFakeFetch(api.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('booking F4 — client của Bước 4', () => {
  it('BRD-04 getRelatives: một GET tới patient/relatives, không thân, trả các hồ sơ ĐANG HIỆU LỰC', async () => {
    const result = await getRelatives();
    expect(api.requests).toEqual([
      { method: 'GET', path: '/patient/relatives' },
    ]);
    expect(result.map((relative) => relative.hoSoNguoiThanId)).toEqual([
      '101',
      '102',
    ]);
  });

  it('BRD-04 postCheck: POST tới booking/checks, thân ĐÚNG hai khoá, bản thân là `hoSoNguoiThanId: null`, KHÔNG `lyDoKham`', async () => {
    const summary = await postCheck('5', null);
    expect(api.requests).toEqual([{ method: 'POST', path: '/booking/checks' }]);
    expect(api.checkBodies).toEqual([
      { khungGioId: '5', hoSoNguoiThanId: null },
    ]);
    expect(Object.keys(api.checkBodies[0]).sort()).toEqual([
      'hoSoNguoiThanId',
      'khungGioId',
    ]);
    expect(summary.dichVu).toBe('Tim mạch');
  });

  it('BRD-04 id lớn hơn 2^53 đi nguyên vẹn dạng chuỗi (không qua Number)', async () => {
    api.relatives = {
      items: [makeRelative({ hoSoNguoiThanId: '9007199254740993' })],
    };
    const [relative] = await getRelatives();
    expect(relative.hoSoNguoiThanId).toBe('9007199254740993');
    await postCheck('9223372036854775807', relative.hoSoNguoiThanId);
    expect(api.checkBodies[0]).toStrictEqual({
      khungGioId: '9223372036854775807',
      hoSoNguoiThanId: '9007199254740993',
    });
  });

  it('BRD-04 `signal` được chuyển đi: huỷ giữa chừng ⇒ RequestAbortedError, không phải lỗi hiển thị', async () => {
    const controller = new AbortController();
    api.failCheckNext(
      (init) =>
        new Promise((_resolve, reject) => {
          // Gắn lắng nghe TRƯỚC rồi mới huỷ: huỷ trước khi gắn thì sự kiện không bao giờ tới
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('đã huỷ', 'AbortError')),
          );
          controller.abort();
        }),
    );
    await expect(
      postCheck('5', null, controller.signal),
    ).rejects.toBeInstanceOf(RequestAbortedError);
  });

  it('BRD-04 phản hồi 200 sai hình dạng ⇒ UnexpectedResponseError (không vẽ dữ liệu sai)', async () => {
    api.check = { tomTat: null };
    await expect(postCheck('5', null)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    api.relatives = { items: 'x' };
    await expect(getRelatives()).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});
