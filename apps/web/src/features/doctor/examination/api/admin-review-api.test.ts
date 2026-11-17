import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { jsonResponse } from '../../testing/fetch-routing';
import { getAdminReview, hideAdminReview, listAdminReviews } from './exam-api';

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

// doctor-exam F8, WKD-21 [đề xuất]: `POST /admin/doctor-ratings/:id/hide` (hợp đồng B8): đường dẫn, thân `{ lyDo }`, `signal`, lỗi đi nguyên, 200 qua bộ đọc chặt, KHÔNG tự gửi lại.
describe('doctor-exam F8 — lời gọi ẩn đánh giá (WKD-21)', () => {
  const HIDDEN = { danhGiaId: '41', biAn: true };
  const sentBody = () =>
    JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<
      string,
      unknown
    >;

  it('WKD-21 POST đúng đường dẫn `/api/admin/doctor-ratings/<id>/hide`, thân CHỈ `{ lyDo }`, `Content-Type` JSON, không query; trả hai khoá', async () => {
    fetchMock.mockResolvedValue(jsonResponse(HIDDEN));
    const result = await hideAdminReview('41', 'Lăng mạ bác sĩ trong nhận xét');
    const call = firstCall();
    expect(call.pathname).toBe('/api/admin/doctor-ratings/41/hide');
    expect(call.search).toBe('');
    expect(call.init?.method).toBe('POST');
    expect(sentBody()).toEqual({ lyDo: 'Lăng mạ bác sĩ trong nhận xét' });
    expect(new Headers(call.init?.headers).get('Content-Type')).toContain(
      'application/json',
    );
    expect(result).toEqual(HIDDEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WKD-21 id đi qua `encodeURIComponent` (không chèn được `/` hay `?` vào đường dẫn); lý do nhiều dòng, dấu và emoji đi NGUYÊN trong thân, KHÔNG vào URL', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...HIDDEN, danhGiaId: 'a/b?c' }),
    );
    const reason = 'Dòng một\nDòng hai 😀 “trích dẫn”';
    await expect(hideAdminReview('a/b?c', reason)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    const call = firstCall();
    expect(call.pathname).toBe('/api/admin/doctor-ratings/a%2Fb%3Fc/hide');
    expect(call.search).toBe('');
    expect(sentBody().lyDo).toBe(reason);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('Dòng');
  });

  it('WKD-21 truyền `signal` xuống `fetch`; đã huỷ ⇒ `RequestAbortedError`', async () => {
    fetchMock.mockResolvedValue(jsonResponse(HIDDEN));
    const controller = new AbortController();
    await hideAdminReview('41', 'Lý do đủ dài rồi', controller.signal);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);

    fetchMock.mockReset();
    controller.abort();
    await expect(
      hideAdminReview('41', 'Lý do đủ dài rồi', controller.signal),
    ).rejects.toBeInstanceOf(RequestAbortedError);
  });

  it('WKD-21 lỗi của máy chủ đi NGUYÊN (`ApiError` với `maLoi`, `loi[]`), và KHÔNG tự gửi lại ở bất kỳ lỗi nào (đúng MỘT `fetch`)', async () => {
    for (const [status, body] of [
      [
        400,
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'lyDo', ma: 'LY_DO_QUA_NGAN' }],
        },
      ],
      [404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }],
      [409, { maLoi: 'DANH_GIA_DA_AN', thongBao: 'x' }],
      [503, { maLoi: 'HE_THONG_DANG_BAN', thongBao: 'x' }],
    ] as const) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(jsonResponse(body, status));
      const error = await hideAdminReview('41', 'Lý do đủ dài rồi').catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).maLoi).toBe(body.maLoi);
      expect((error as ApiError).loi).toEqual(
        'loi' in body ? body.loi : undefined,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('WKD-21 mất mạng ⇒ `NetworkError`, không tự gửi lại; 200 sai hình dạng (`biAn` false, thiếu khoá, không phải JSON đối tượng) ⇒ `UnexpectedResponseError`', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      hideAdminReview('41', 'Lý do đủ dài rồi'),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    for (const body of [
      { danhGiaId: '41', biAn: false },
      { danhGiaId: '41' },
      { biAn: true },
      [],
      'ok',
    ]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(jsonResponse(body));
      await expect(
        hideAdminReview('41', 'Lý do đủ dài rồi'),
      ).rejects.toBeInstanceOf(UnexpectedResponseError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('WKD-21 `danhGiaId` trả về KHÁC id đã gửi ⇒ `UnexpectedResponseError` ("chưa rõ", không coi là đã ẩn đúng đánh giá)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ danhGiaId: '42', biAn: true }));
    await expect(
      hideAdminReview('41', 'Lý do đủ dài rồi'),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(HIDDEN));
    await expect(hideAdminReview('41', 'Lý do đủ dài rồi')).resolves.toEqual(
      HIDDEN,
    );
  });
});
