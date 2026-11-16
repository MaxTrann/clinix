import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import {
  ApiError,
  RequestAbortedError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { jsonResponse } from '../../testing/fetch-routing';
import { completeAppointment, saveExamRecord } from './exam-api';

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

// doctor-exam F3: lớp gọi API của hộp ghi hồ sơ (WHS-04 mức hàm; hợp đồng B2, PLAN 5.5). Cùng `request()` duy nhất.
const SAVED = {
  trieuChung: 'Ho khan',
  chanDoanSoBo: 'Viêm họng',
  huongXuLy: 'Nghỉ ngơi',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
};
const BODY = {
  trieuChung: 'Ho khan',
  chanDoanSoBo: 'Viêm họng',
  huongXuLy: 'Nghỉ ngơi',
  ngayTaiKhamDuKien: null,
  capNhatLanCuoi: null,
};

describe('doctor-exam F3 — saveExamRecord', () => {
  it('WHS-04 MỘT PUT tới /doctor/appointments/<mã>/exam-record, thân JSON đúng năm khoá, có token và signal', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SAVED));
    const controller = new AbortController();
    await expect(
      saveExamRecord('CP20261018001', BODY, controller.signal),
    ).resolves.toEqual(SAVED);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(
      /\/doctor\/appointments\/CP20261018001\/exam-record$/,
    );
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual(BODY);
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-gia');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('WHS-04 `capNhatLanCuoi` đã thấy đi NGUYÊN VĂN trong thân (không đổi định dạng)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SAVED));
    await saveExamRecord('CP20261018001', {
      ...BODY,
      capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
    });
    expect(
      JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).capNhatLanCuoi,
    ).toBe('2026-06-10T10:30:00.000Z');
  });

  it('WHS-04 mã có ký tự đặc biệt đi qua encodeURIComponent', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SAVED));
    await saveExamRecord('A/B?C#D', BODY);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/doctor\/appointments\/A%2FB%3FC%23D\/exam-record$/,
    );
  });

  it('WHS-04 200 có ngày tái khám `null` được nhận; khoá thừa bị bỏ (không chép sang kết quả)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...SAVED, ngayTaiKhamDuKien: null, bacSiId: '7' }),
    );
    await expect(saveExamRecord('CP20261018001', BODY)).resolves.toEqual({
      ...SAVED,
      ngayTaiKhamDuKien: null,
    });
  });

  it.each([
    ['thân rỗng', undefined],
    ['null', null],
    ['mảng', []],
    ['chuỗi', 'ok'],
    ['thiếu trieuChung', { ...SAVED, trieuChung: undefined }],
    ['chanDoanSoBo là số', { ...SAVED, chanDoanSoBo: 5 }],
    ['thiếu huongXuLy', { ...SAVED, huongXuLy: undefined }],
    ['ngày sai dạng', { ...SAVED, ngayTaiKhamDuKien: '10/07/2026' }],
    ['ngày là số', { ...SAVED, ngayTaiKhamDuKien: 20260710 }],
    ['thiếu capNhatLanCuoi', { ...SAVED, capNhatLanCuoi: undefined }],
    ['capNhatLanCuoi không phải ISO', { ...SAVED, capNhatLanCuoi: 'hôm qua' }],
  ])(
    'WHS-04 200 sai hình dạng (%s) ⇒ UnexpectedResponseError (coi là "chưa rõ", KHÔNG phải thành công)',
    async (_name, body) => {
      fetchMock.mockResolvedValue(
        body === undefined
          ? new Response('', { status: 200 })
          : jsonResponse(body),
      );
      await expect(
        saveExamRecord('CP20261018001', BODY),
      ).rejects.toBeInstanceOf(UnexpectedResponseError);
    },
  );

  it('WHS-15 lỗi 400 giữ nguyên `loi[]` (không giá trị) và không tự gửi lại', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'trieuChung', ma: 'NOI_DUNG_KHONG_HOP_LE' }],
        },
        400,
      ),
    );
    const error = await saveExamRecord('CP20261018001', BODY).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).loi).toEqual([
      { truong: 'trieuChung', ma: 'NOI_DUNG_KHONG_HOP_LE' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WHS-09 nơi gọi huỷ giữa chừng ⇒ RequestAbortedError (không phải lỗi mạng)', async () => {
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = saveExamRecord('CP20261018001', BODY, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(RequestAbortedError);
  });
});
