import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import { ApiError, UnexpectedResponseError } from '../../../shared/api/errors';
import { makePublished, toPublicDetail } from '../testing/article-fixtures';
import { httpArticleApi } from './article-api';

// article F3, ABU-09: lớp `httpArticleApi` phần đánh giá gọi đúng đường dẫn, phương thức, thân; route của Bệnh nhân nên CÓ Authorization (khác route công khai, nơi `skipAuthToken`).
// Nếp của `article-public-api.test.ts`: stub `fetch`, có sẵn phiên đăng nhập để lời gọi lỡ `skipAuthToken` bị lộ.
const fetchMock = vi.fn<typeof fetch>();
const SESSION_ACCESS = `acc-${Math.random().toString(36).slice(2)}`;

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  const parsed = new URL(String(url), 'http://localhost');
  return {
    path: parsed.pathname,
    search: parsed.search,
    method: init?.method,
    body: init?.body,
    headers: new Headers(init?.headers),
  };
}

const signal = () => new AbortController().signal;
const RESULT = { loai: 'Thich', luotThich: 6, luotKhongThich: 2 };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setApiAuthHooks({
    getAccessToken: () => SESSION_ACCESS,
    recoverFromUnauthorized: async () => false,
  });
});

afterEach(() => {
  setApiAuthHooks(null);
  vi.unstubAllGlobals();
});

describe('httpArticleApi.getMyRating (ABU-09)', () => {
  it('ABU-09 GET /api/patient/articles/12/rating, không thân, CÓ Authorization; trả null hay loại phiếu', async () => {
    fetchMock.mockResolvedValueOnce(reply({ loai: null }));
    await expect(
      httpArticleApi.getMyRating('12', signal()),
    ).resolves.toBeNull();
    const call = lastCall();
    expect(call.path).toBe('/api/patient/articles/12/rating');
    expect(call.search).toBe('');
    expect(call.method).toBe('GET');
    expect(call.body).toBeUndefined();
    expect(call.headers.get('Authorization')).toBe(`Bearer ${SESSION_ACCESS}`);

    fetchMock.mockResolvedValueOnce(reply({ loai: 'KhongThich' }));
    await expect(httpArticleApi.getMyRating('12', signal())).resolves.toBe(
      'KhongThich',
    );
  });

  it('ABU-09 mã bài được mã hoá trong đường dẫn (không thoát ra ngoài đoạn id)', async () => {
    fetchMock.mockResolvedValueOnce(reply({ loai: null }));
    await httpArticleApi.getMyRating('a/b?x', signal());
    expect(lastCall().path).toBe('/api/patient/articles/a%2Fb%3Fx/rating');
  });

  it.each([[[]], [null], [{}], [{ loai: 'thich' }], [{ loai: 1 }]])(
    'ABU-09 thân sai hình dạng %j ⇒ UnexpectedResponseError',
    async (body) => {
      fetchMock.mockResolvedValueOnce(reply(body));
      await expect(
        httpArticleApi.getMyRating('12', signal()),
      ).rejects.toBeInstanceOf(UnexpectedResponseError);
    },
  );

  it.each([
    [401, 'CHUA_DANG_NHAP'],
    [403, 'KHONG_DU_QUYEN'],
    [404, 'KHONG_TIM_THAY'],
  ])('ABU-09 lỗi %i giữ nguyên mã %s của máy chủ', async (status, maLoi) => {
    fetchMock.mockResolvedValueOnce(reply({ maLoi, thongBao: 'x' }, status));
    await expect(
      httpArticleApi.getMyRating('12', signal()),
    ).rejects.toMatchObject({ status, maLoi });
  });
});

describe('httpArticleApi.setRating (ABU-09)', () => {
  it('ABU-09 PUT với thân CHÍNH XÁC {"loai":"Thich"}, CÓ Authorization; trả đủ ba khoá', async () => {
    fetchMock.mockResolvedValueOnce(reply(RESULT));
    await expect(httpArticleApi.setRating('12', 'Thich')).resolves.toEqual(
      RESULT,
    );
    const call = lastCall();
    expect(call.path).toBe('/api/patient/articles/12/rating');
    expect(call.method).toBe('PUT');
    expect(call.body).toBe('{"loai":"Thich"}');
    expect(call.headers.get('Content-Type')).toBe('application/json');
    expect(call.headers.get('Authorization')).toBe(`Bearer ${SESSION_ACCESS}`);
  });

  it('ABU-09 loại kia: thân {"loai":"KhongThich"}', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ loai: 'KhongThich', luotThich: 5, luotKhongThich: 3 }),
    );
    await httpArticleApi.setRating('12', 'KhongThich');
    expect(lastCall().body).toBe('{"loai":"KhongThich"}');
  });

  it.each([
    ['thiếu số đếm', { loai: 'Thich' }],
    ['loai lạ', { loai: 'Like', luotThich: 1, luotKhongThich: 0 }],
    ['số đếm âm', { loai: 'Thich', luotThich: -1, luotKhongThich: 0 }],
  ])('ABU-09 thân trả về %s ⇒ UnexpectedResponseError', async (_n, body) => {
    fetchMock.mockResolvedValueOnce(reply(body));
    await expect(
      httpArticleApi.setRating('12', 'Thich'),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('ABU-09 404 mang mã KHONG_TIM_THAY (web chọn câu theo MÃ)', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404),
    );
    const error = await httpArticleApi.setRating('12', 'Thich').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });
  });

  it('ABU-09 401 ⇒ hook làm mới được hỏi với đúng đường dẫn rồi lời gọi (idempotent) được gửi lại ĐÚNG một lần', async () => {
    const recover = vi.fn(async () => true);
    setApiAuthHooks({
      getAccessToken: () => SESSION_ACCESS,
      recoverFromUnauthorized: recover,
    });
    fetchMock
      .mockResolvedValueOnce(
        reply({ maLoi: 'TOKEN_KHONG_HOP_LE', thongBao: 'x' }, 401),
      )
      .mockResolvedValueOnce(reply(RESULT));
    await expect(httpArticleApi.setRating('12', 'Thich')).resolves.toEqual(
      RESULT,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'patient/articles/12/rating',
        accessToken: SESSION_ACCESS,
      }),
    );
  });
});

describe('httpArticleApi.clearRating (ABU-09)', () => {
  it('ABU-09 DELETE không thân, CÓ Authorization; sau thu hồi `loai` là null', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ loai: null, luotThich: 5, luotKhongThich: 2 }),
    );
    await expect(httpArticleApi.clearRating('12')).resolves.toEqual({
      loai: null,
      luotThich: 5,
      luotKhongThich: 2,
    });
    const call = lastCall();
    expect(call.path).toBe('/api/patient/articles/12/rating');
    expect(call.method).toBe('DELETE');
    expect(call.body).toBeUndefined();
    expect(call.headers.get('Authorization')).toBe(`Bearer ${SESSION_ACCESS}`);
  });

  it('ABU-09 thân sai hình dạng ⇒ UnexpectedResponseError', async () => {
    fetchMock.mockResolvedValueOnce(reply({ luotThich: 1, luotKhongThich: 1 }));
    await expect(httpArticleApi.clearRating('12')).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});

describe('httpArticleApi.getPublic sau F3 (ABU-12, W7)', () => {
  it('ABU-12 chi tiết công khai: KHÔNG gắn Authorization dù đã đăng nhập (khách cũng gọi); trả 9 khoá kèm hai số đếm', async () => {
    const detail = toPublicDetail(makePublished({ baiVietId: '12' }), {
      luotThich: 5,
      luotKhongThich: 2,
    });
    fetchMock.mockResolvedValueOnce(reply(detail));
    const parsed = await httpArticleApi.getPublic('12', signal());
    expect(parsed.luotThich).toBe(5);
    expect(parsed.luotKhongThich).toBe(2);
    expect(lastCall().path).toBe('/api/public/articles/12');
    expect(lastCall().headers.get('Authorization')).toBeNull();
  });
});
