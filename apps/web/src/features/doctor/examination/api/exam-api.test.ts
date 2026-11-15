import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import {
  ApiError,
  RequestAbortedError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { jsonResponse } from '../../testing/fetch-routing';
import { completeAppointment } from './exam-api';

// doctor-exam F1: lớp gọi API của `Hoàn thành ca khám` (WHT-03 mức hàm; hợp đồng B1). Mọi lời gọi đi qua `request()` (lớp client DUY NHẤT).
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

const COMPLETED = { maLichHen: 'CP20261018001', trangThai: 'HoanThanh' };

describe('doctor-exam F1 — completeAppointment', () => {
  it('WHT-03 MỘT POST tới /doctor/appointments/<mã>/complete, KHÔNG thân, có token, kèm signal', async () => {
    fetchMock.mockResolvedValue(jsonResponse(COMPLETED));
    const controller = new AbortController();
    await expect(
      completeAppointment('CP20261018001', controller.signal),
    ).resolves.toEqual(COMPLETED);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(
      /\/doctor\/appointments\/CP20261018001\/complete$/,
    );
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-gia');
    expect(headers.has('Content-Type')).toBe(false);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('WHT-04 nơi gọi huỷ giữa chừng ⇒ signal của `fetch` bị huỷ và nhận RequestAbortedError (không phải lỗi mạng)', async () => {
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = completeAppointment('CP20261018001', controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(RequestAbortedError);
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WHT-03 mã có ký tự đặc biệt đi qua encodeURIComponent', async () => {
    fetchMock.mockResolvedValue(jsonResponse(COMPLETED));
    await completeAppointment('A/B?C#D');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/doctor\/appointments\/A%2FB%3FC%23D\/complete$/,
    );
  });

  it.each([
    ['thân rỗng', undefined],
    ['null', null],
    ['mảng', []],
    ['chuỗi', 'HoanThanh'],
    ['thiếu maLichHen', { trangThai: 'HoanThanh' }],
    ['maLichHen là số', { maLichHen: 5, trangThai: 'HoanThanh' }],
    ['trangThai khác', { maLichHen: 'CP1', trangThai: 'DaTiepDon' }],
    ['trangThai viết thường', { maLichHen: 'CP1', trangThai: 'hoanthanh' }],
  ])(
    'WHT-06 200 sai hình dạng (%s) ⇒ UnexpectedResponseError (coi là "chưa rõ", KHÔNG phải thành công)',
    async (_name, body) => {
      fetchMock.mockResolvedValue(
        body === undefined
          ? new Response('', { status: 200 })
          : jsonResponse(body),
      );
      await expect(completeAppointment('CP20261018001')).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
    },
  );

  it('WHT-06 lỗi API đi nguyên ApiError (maLoi và chiTiet còn đủ để chọn câu)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
          thongBao: 'x',
          chiTiet: { tuTrangThai: 'HoanThanh', denTrangThai: 'HoanThanh' },
        },
        409,
      ),
    );
    const error = await completeAppointment('CP20261018001').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).maLoi).toBe('CHUYEN_TRANG_THAI_KHONG_HOP_LE');
    expect((error as ApiError).chiTiet).toEqual({
      tuTrangThai: 'HoanThanh',
      denTrangThai: 'HoanThanh',
    });
    // KHÔNG tự gửi lại khi lỗi
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
