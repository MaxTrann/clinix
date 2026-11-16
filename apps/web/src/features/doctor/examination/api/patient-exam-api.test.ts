import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { jsonResponse } from '../../testing/fetch-routing';
import {
  getPatientExamDetail,
  getPatientExamRecords,
  submitRating,
} from './exam-api';

// doctor-exam F5, WXH-14 [đề xuất]: lớp gọi API của trang Hồ sơ khám bệnh của Bệnh nhân (hợp đồng B4, B5). Mọi lời gọi đi qua `request()` (lớp client DUY NHẤT); hai GET, không thân.
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

const COUNTS = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [String(index + 1), 0]),
);
const PAGE = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 1,
  demTheoThang: COUNTS,
  nguoiKham: [],
};
const DETAIL = {
  maLichHen: 'CLX-1',
  thoiGian: '2026-06-10T02:00:00.000Z',
  chuyenKhoa: 'Tim mạch',
  chiNhanh: 'CLINIX Chi nhánh Quận 3',
  bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
  nguoiKham: { hoTen: 'Nguyễn Văn A', quanHe: null },
  hoSoKham: null,
  danhGia: null,
  coTheDanhGia: true,
};

function lastCall() {
  const [url, init] = fetchMock.mock.calls[0];
  const parsed = new URL(String(url), 'http://web.invalid');
  return {
    pathname: parsed.pathname,
    params: Object.fromEntries(parsed.searchParams.entries()),
    search: parsed.search,
    init,
  };
}

describe('doctor-exam F5 — getPatientExamRecords', () => {
  it('WXH-14 tất cả người khám, cả năm: MỘT GET /patient/exam-records chỉ có `nam` và `pageSize` (không `nguoiKham`, `thang`, `page`), KHÔNG thân, có token, kèm signal', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAGE));
    const controller = new AbortController();
    await getPatientExamRecords({ nam: 2026, pageSize: 1 }, controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = lastCall();
    expect(call.pathname).toMatch(/\/patient\/exam-records$/);
    expect(call.params).toEqual({ nam: '2026', pageSize: '1' });
    expect(call.init?.method).toBe('GET');
    expect(call.init?.body).toBeUndefined();
    const headers = new Headers(call.init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-gia');
    expect(headers.has('Content-Type')).toBe(false);
    expect(call.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('WXH-14 bản thân, tháng 10, 50 dòng: `nguoiKham=BanThan`, `thang=10`, `pageSize=50`', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAGE));
    await getPatientExamRecords({
      nguoiKham: 'BanThan',
      nam: 2026,
      thang: 10,
      pageSize: 50,
    });
    expect(lastCall().params).toEqual({
      nguoiKham: 'BanThan',
      nam: '2026',
      thang: '10',
      pageSize: '50',
    });
  });

  it('WXH-14 người thân: `nguoiKham` là id hồ sơ dạng chuỗi', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAGE));
    await getPatientExamRecords({ nguoiKham: '501', nam: 2025, pageSize: 1 });
    expect(lastCall().params.nguoiKham).toBe('501');
  });

  it('WXH-14 kết quả đi qua bộ đọc chặt (12 tháng thành mảng)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAGE));
    const result = await getPatientExamRecords({ nam: 2026, pageSize: 1 });
    expect(result.demTheoThang).toHaveLength(12);
  });

  it('WXH-10 200 sai hình dạng ⇒ UnexpectedResponseError (hộp lỗi, không vẽ dữ liệu dở)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...PAGE, demTheoThang: {} }));
    await expect(
      getPatientExamRecords({ nam: 2026, pageSize: 1 }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('WXH-14 lỗi 400 của máy chủ đi nguyên thành ApiError (không nuốt, không tự gửi lại)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'nam', ma: 'MIN' }],
        },
        400,
      ),
    );
    const error = await getPatientExamRecords({ nam: 1990, pageSize: 1 }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WXH-14 mạng đứt ⇒ NetworkError; nơi gọi huỷ ⇒ signal của `fetch` bị huỷ và RequestAbortedError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      getPatientExamRecords({ nam: 2026, pageSize: 1 }),
    ).rejects.toBeInstanceOf(NetworkError);

    fetchMock.mockReset();
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = getPatientExamRecords(
      { nam: 2026, pageSize: 1 },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(RequestAbortedError);
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(
      true,
    );
  });
});

describe('doctor-exam F5 — getPatientExamDetail', () => {
  it('WXH-14 MỘT GET /patient/exam-records/<mã>, không query, không thân, có token, kèm signal', async () => {
    fetchMock.mockResolvedValue(jsonResponse(DETAIL));
    const controller = new AbortController();
    const result = await getPatientExamDetail('CLX-1', controller.signal);

    expect(result.maLichHen).toBe('CLX-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = lastCall();
    expect(call.pathname).toMatch(/\/patient\/exam-records\/CLX-1$/);
    expect(call.search).toBe('');
    expect(call.init?.method).toBe('GET');
    expect(call.init?.body).toBeUndefined();
    expect(new Headers(call.init?.headers).get('Authorization')).toBe(
      'Bearer token-gia',
    );
    expect(call.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('WXH-07, WXH-14 mã có ký tự đặc biệt đi qua encodeURIComponent (không thêm đoạn đường, không query)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(DETAIL));
    await getPatientExamDetail('A/B?C#D E');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/patient\/exam-records\/A%2FB%3FC%23D%20E$/);
  });

  it('WDG-11 `danhGia` và `coTheDanhGia` đi tiếp (F6 đọc, F5 bỏ); 404 `KHONG_TIM_THAY` đi nguyên thành ApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(DETAIL));
    const result = await getPatientExamDetail('CLX-1');
    expect(result.danhGia).toBeNull();
    expect(result.coTheDanhGia).toBe(true);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { maLoi: 'KHONG_TIM_THAY', thongBao: 'Không tìm thấy.' },
        404,
      ),
    );
    const error = await getPatientExamDetail('CLX-9').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).maLoi).toBe('KHONG_TIM_THAY');
  });

  it('WXH-11 200 sai hình dạng ⇒ UnexpectedResponseError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...DETAIL, hoSoKham: undefined }),
    );
    await expect(getPatientExamDetail('CLX-1')).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});

// doctor-exam F6, WDG-12 [đề xuất]: lời gọi `POST /patient/exam-records/:maLichHen/rating` (B6, PLAN 5.7). Qua `request()` (lớp client DUY NHẤT); thân JSON đúng; mã lịch `encodeURIComponent`; kèm `signal`; 201 qua bộ đọc CHẶT (sai hình dạng ⇒ `UnexpectedResponseError`:
// nơi gọi coi là "chưa rõ", máy chủ có thể đã lưu); lỗi của máy chủ đi nguyên thành `ApiError`; KHÔNG tự gửi lại ở bất kỳ lỗi nào (API không idempotent).
const RATED = {
  soSao: 5,
  nhanXet: 'Rất tốt',
  thoiDiemTao: '2026-06-11T01:00:00.000Z',
};

describe('doctor-exam F6 — submitRating (WDG-12)', () => {
  it('WDG-12 MỘT POST /patient/exam-records/<mã>/rating, thân JSON đúng, Content-Type JSON, có token, kèm signal; trả đúng ba khoá của 201', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RATED, 201));
    const controller = new AbortController();
    const result = await submitRating(
      'CLX-1',
      { soSao: 5, nhanXet: 'Rất tốt' },
      controller.signal,
    );

    expect(result).toEqual(RATED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = lastCall();
    expect(call.pathname).toMatch(/\/patient\/exam-records\/CLX-1\/rating$/);
    expect(call.search).toBe('');
    expect(call.init?.method).toBe('POST');
    expect(JSON.parse(String(call.init?.body))).toEqual({
      soSao: 5,
      nhanXet: 'Rất tốt',
    });
    const headers = new Headers(call.init?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer token-gia');
    expect(call.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('WDG-12 không nhận xét: thân CHỈ có `soSao` (không khoá `nhanXet`, không `null`)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...RATED, nhanXet: null }, 201));
    const result = await submitRating('CLX-1', { soSao: 3 });
    expect(result.nhanXet).toBeNull();
    expect(String(lastCall().init?.body)).toBe('{"soSao":3}');
  });

  it('WDG-12 mã có ký tự đặc biệt đi qua encodeURIComponent (không thêm đoạn đường, không query)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RATED, 201));
    await submitRating('A/B?C#D E', { soSao: 1 });
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(
      /\/patient\/exam-records\/A%2FB%3FC%23D%20E\/rating$/,
    );
  });

  it('WDG-12 201 sai hình dạng (thiếu khoá, sai kiểu, ngày không ISO, thân rỗng) ⇒ UnexpectedResponseError', async () => {
    for (const body of [
      { ...RATED, soSao: undefined },
      { ...RATED, soSao: 9 },
      { ...RATED, thoiDiemTao: 'hôm qua' },
      {},
    ]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(jsonResponse(body, 201));
      await expect(submitRating('CLX-1', { soSao: 5 })).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('WDG-12 lỗi 400, 404, 409 của máy chủ đi nguyên thành ApiError với đủ `maLoi`, `loi`, `chiTiet`; KHÔNG tự gửi lại', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'soSao', ma: 'SO_SAO_BAT_BUOC' }],
        },
        400,
      ),
    );
    const invalid = await submitRating('CLX-1', { soSao: 5 }).catch(
      (caught: unknown) => caught,
    );
    expect(invalid).toBeInstanceOf(ApiError);
    expect((invalid as ApiError).maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    expect((invalid as ApiError).loi).toEqual([
      { truong: 'soSao', ma: 'SO_SAO_BAT_BUOC' },
    ]);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          maLoi: 'LICH_HEN_CHUA_HOAN_THANH',
          thongBao: 'x',
          chiTiet: { trangThai: 'DaXacNhan' },
        },
        409,
      ),
    );
    const notDone = await submitRating('CLX-1', { soSao: 5 }).catch(
      (caught: unknown) => caught,
    );
    expect((notDone as ApiError).maLoi).toBe('LICH_HEN_CHUA_HOAN_THANH');
    expect((notDone as ApiError).chiTiet).toEqual({ trangThai: 'DaXacNhan' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WDG-12 mạng đứt ⇒ NetworkError và ĐÚNG MỘT lần gọi (không tự gửi lại: có thể đã lưu); nơi gọi huỷ ⇒ RequestAbortedError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(submitRating('CLX-1', { soSao: 5 })).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = submitRating('CLX-1', { soSao: 5 }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(RequestAbortedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
