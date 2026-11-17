import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { jsonResponse } from '../../testing/fetch-routing';
import { getAdminReview, listAdminReviews } from './exam-api';

// doctor-exam F7, WKD-13 [đề xuất]: lớp gọi API của trang Kiểm duyệt đánh giá (hợp đồng B7). Mọi lời gọi đi qua `request()` của `shared/api/client`; bộ đọc chặt kiểm riêng ở `admin-review-readers.test.ts`. Dữ liệu giả.
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setApiAuthHooks({
    getAccessToken: () => 'khoa-gia',
    recoverFromUnauthorized: async () => false,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

const PAGE = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  demTheoTrangThai: { HienThi: 0, DaAn: 0 },
};
const DETAIL = {
  danhGiaId: '41',
  bacSi: { bacSiId: '11', hoTen: 'Nguyễn Minh Anh' },
  chiNhanh: { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' },
  nguoiDanhGia: { hoTen: 'Vũ Thị F' },
  soSao: 4,
  nhanXet: 'Tốt',
  thoiDiemTao: '2026-05-28T03:00:00.000Z',
  biAn: false,
  maLichHen: 'CLX-20260611-00006',
  thoiGianKham: '2026-06-11T02:30:00.000Z',
};

function firstCall() {
  const [url, init] = fetchMock.mock.calls[0];
  const parsed = new URL(String(url), 'http://web.invalid');
  return {
    pathname: parsed.pathname,
    search: parsed.search,
    params: Object.fromEntries(parsed.searchParams.entries()),
    init,
  };
}

describe('doctor-exam F7 — lời gọi API của Admin (WKD-13)', () => {
  it('WKD-13 danh sách: GET đúng đường dẫn, CHỈ page và pageSize khi không lọc (khoá `undefined` bị bỏ), không thân', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAGE));
    const page = await listAdminReviews({ page: 1, pageSize: 20 });
    const call = firstCall();
    expect(call.pathname).toBe('/api/admin/doctor-ratings');
    expect(call.params).toEqual({ page: '1', pageSize: '20' });
    expect(call.init?.method ?? 'GET').toBe('GET');
    expect(call.init?.body).toBeUndefined();
    expect(page.demTheoTrangThai).toEqual({ HienThi: 0, DaAn: 0 });
  });

  it('WKD-13 danh sách: đủ bộ lọc đi đúng tên khoá và giá trị', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAGE));
    await listAdminReviews({
      trangThai: 'DaAn',
      soSao: 5,
      bacSiId: '11',
      chiNhanhId: '2',
      q: 'Nguyễn',
      page: 3,
      pageSize: 20,
    });
    expect(firstCall().params).toEqual({
      trangThai: 'DaAn',
      soSao: '5',
      bacSiId: '11',
      chiNhanhId: '2',
      q: 'Nguyễn',
      page: '3',
      pageSize: '20',
    });
  });

  it('WKD-13 danh sách: `q` có `&`, `=`, `#`, dấu cách, tiếng Việt vẫn đi nguyên một giá trị (mã hoá đúng)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAGE));
    const q = 'a&b=c#d ê?';
    await listAdminReviews({ q, page: 1, pageSize: 20 });
    const call = firstCall();
    expect(call.params.q).toBe(q);
    expect(Object.keys(call.params).sort()).toEqual(['page', 'pageSize', 'q']);
  });

  it('WKD-13 danh sách: gắn Authorization, truyền `signal` (huỷ được), 200 sai hình dạng ⇒ UnexpectedResponseError', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = listAdminReviews(
      { page: 1, pageSize: 20 },
      controller.signal,
    );
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer khoa-gia');
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(RequestAbortedError);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await expect(
      listAdminReviews({ page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('WKD-13 danh sách: ApiError (400, 403, 500) và NetworkError đi NGUYÊN, KHÔNG tự gửi lại', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ maLoi: 'KHONG_DU_QUYEN', thongBao: 'câu của API' }, 403),
    );
    const error = await listAdminReviews({ page: 1, pageSize: 20 }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).maLoi).toBe('KHONG_DU_QUYEN');
    expect((error as ApiError).status).toBe(403);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      listAdminReviews({ page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WKD-13 chi tiết: GET theo id; id lớn hơn 2^53 đi NGUYÊN chữ số; id có `/`, `?`, `#` được mã hoá', async () => {
    // Mỗi lời gọi một `Response` mới (thân chỉ đọc được một lần)
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(DETAIL)));
    await getAdminReview('9007199254740993');
    expect(firstCall().pathname).toBe(
      '/api/admin/doctor-ratings/9007199254740993',
    );

    fetchMock.mockClear();
    await getAdminReview('a/b?c#d');
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/admin/doctor-ratings/a%2Fb%3Fc%23d',
    );
    expect(fetchMock.mock.calls[0][1]?.method ?? 'GET').toBe('GET');
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
  });

  it('WKD-13 chi tiết: 404 `KHONG_TIM_THAY` đi nguyên, 200 sai hình dạng ⇒ UnexpectedResponseError, huỷ được, không tự gửi lại', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ maLoi: 'KHONG_TIM_THAY', thongBao: 'câu của API' }, 404),
    );
    const error = await getAdminReview('41').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).maLoi).toBe('KHONG_TIM_THAY');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ ...DETAIL, biAn: 'true' }));
    await expect(getAdminReview('41')).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );

    const controller = new AbortController();
    controller.abort();
    await expect(
      getAdminReview('41', controller.signal),
    ).rejects.toBeInstanceOf(RequestAbortedError);
  });

  it('WKD-13 chi tiết: 200 đúng ⇒ đọc qua bộ đọc chặt (khoá `lyDoAn` vắng ⇒ null)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...DETAIL, thua: 1 }));
    const detail = await getAdminReview('41');
    expect(detail.lyDoAn).toBeNull();
    expect(Object.keys(detail)).not.toContain('thua');
  });
});
