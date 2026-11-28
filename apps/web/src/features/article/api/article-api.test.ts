import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  makeDetail,
  makeListItem,
  makeListPage,
} from '../testing/article-fixtures';
import { httpArticleApi } from './article-api';

// article F1, ABW-12 (phần HTTP): lớp `httpArticleApi` gọi đúng đường dẫn, phương thức, query, thân (PLAN 5.7), qua lớp client duy nhất, có Authorization
// (route Quản trị viên). Nếp kiểm lời gọi theo `chatbot-api.test.ts`: stub `fetch`, có sẵn phiên đăng nhập để lời gọi quên token bị lộ.
const fetchMock = vi.fn<typeof fetch>();
const SESSION_ACCESS = `acc-${Math.random().toString(36).slice(2)}`;

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Mọi lời gọi của test nhận một BẢN SAO của cùng một phản hồi (thân `Response` chỉ đọc được một lần)
function answer(response: Response) {
  fetchMock.mockImplementation(async () => response.clone());
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  const parsed = new URL(String(url), 'http://localhost');
  return {
    path: parsed.pathname,
    query: Object.fromEntries(parsed.searchParams),
    method: init?.method,
    headers: new Headers(init?.headers),
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
}

const controller = () => new AbortController().signal;

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

describe('httpArticleApi.list', () => {
  it('ABW-12 GET /api/admin/articles?page&pageSize=20, đúng một lời gọi, có Authorization, trả trang đã kiểm', async () => {
    const body = makeListPage([makeListItem({ baiVietId: '3' })]);
    answer(reply(body));

    const result = await httpArticleApi.list({ page: 2 }, controller());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = lastCall();
    expect(call.path).toBe('/api/admin/articles');
    expect(call.method).toBe('GET');
    expect(call.query).toEqual({ page: '2', pageSize: '20' });
    expect(call.headers.get('Authorization')).toBe(`Bearer ${SESSION_ACCESS}`);
    expect(result).toEqual(body);
  });

  it('ABW-12 gửi q, trangThai, the khi có; khoá vắng thì không có trong query', async () => {
    answer(reply(makeListPage([])));

    await httpArticleApi.list(
      { page: 1, q: 'sốt', trangThai: 'DaXuatBan', the: 'trẻ-em' },
      controller(),
    );
    expect(lastCall().query).toEqual({
      q: 'sốt',
      trangThai: 'DaXuatBan',
      the: 'trẻ-em',
      page: '1',
      pageSize: '20',
    });

    await httpArticleApi.list({ page: 1 }, controller());
    expect(Object.keys(lastCall().query).sort()).toEqual(['page', 'pageSize']);
  });

  it('ABW-12 thân sai hình dạng ⇒ UnexpectedResponseError (không trả dữ liệu nửa vời)', async () => {
    answer(reply({ items: [], total: 0, page: 1, pageSize: 20 }));
    await expect(
      httpArticleApi.list({ page: 1 }, controller()),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('ABW-12 huỷ yêu cầu ⇒ RequestAbortedError; mất mạng ⇒ NetworkError; 403 ⇒ ApiError giữ maLoi', async () => {
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      httpArticleApi.list({ page: 1 }, aborted.signal),
    ).rejects.toBeInstanceOf(RequestAbortedError);

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(
      httpArticleApi.list({ page: 1 }, controller()),
    ).rejects.toBeInstanceOf(NetworkError);

    fetchMock.mockResolvedValueOnce(
      reply({ maLoi: 'KHONG_DU_QUYEN', thongBao: 'x' }, 403),
    );
    await expect(
      httpArticleApi.list({ page: 1 }, controller()),
    ).rejects.toMatchObject({ status: 403, maLoi: 'KHONG_DU_QUYEN' });
  });
});

describe('httpArticleApi.get', () => {
  it('ABW-12 GET /api/admin/articles/:id, id được mã hoá, trả chi tiết có noiDung', async () => {
    const detail = makeDetail({ baiVietId: '12', noiDung: 'Nội dung đủ' });
    answer(reply(detail));

    expect(await httpArticleApi.get('12', controller())).toEqual(detail);
    expect(lastCall().path).toBe('/api/admin/articles/12');

    await httpArticleApi.get('a/b', controller());
    expect(lastCall().path).toBe('/api/admin/articles/a%2Fb');
  });

  it('ABW-12 404 KHONG_TIM_THAY ⇒ ApiError; chi tiết thiếu noiDung ⇒ UnexpectedResponseError', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404),
    );
    await expect(httpArticleApi.get('5', controller())).rejects.toMatchObject({
      status: 404,
      maLoi: 'KHONG_TIM_THAY',
    });

    fetchMock.mockResolvedValueOnce(
      reply({ ...makeDetail(), noiDung: undefined }),
    );
    await expect(httpArticleApi.get('5', controller())).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});

describe('httpArticleApi.create và update', () => {
  it('ABW-12 POST /api/admin/articles với thân đúng như đã truyền (noiDung và hashtag luôn có), trả chi tiết', async () => {
    const created = makeDetail({ baiVietId: '40' });
    answer(reply(created, 201));
    const input = {
      tieuDe: 'Bài mới',
      noiDung: '',
      hashtag: [],
      trangThai: 'BanNhap' as const,
    };

    expect(await httpArticleApi.create(input)).toEqual(created);

    const call = lastCall();
    expect(call.path).toBe('/api/admin/articles');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual(input);
    expect(call.headers.get('Content-Type')).toBe('application/json');
    expect(call.headers.get('Authorization')).toBe(`Bearer ${SESSION_ACCESS}`);
  });

  it('ABW-12 PATCH /api/admin/articles/:id gửi ĐÚNG các khoá đã truyền (xoá mô tả bằng chuỗi rỗng, thay thẻ bằng cả mảng)', async () => {
    answer(reply(makeDetail({ baiVietId: '12' })));

    await httpArticleApi.update('12', { moTaNgan: '', hashtag: ['a', 'b'] });
    const call = lastCall();
    expect(call.path).toBe('/api/admin/articles/12');
    expect(call.method).toBe('PATCH');
    expect(call.body).toEqual({ moTaNgan: '', hashtag: ['a', 'b'] });

    await httpArticleApi.update('12', { trangThai: 'LuuTruAn' });
    expect(lastCall().body).toEqual({ trangThai: 'LuuTruAn' });
  });

  it('ABW-12 400 theo ô: ApiError giữ maLoi, loi[].truong và loi[].ma; 409 giữ chiTiet.theDaCo', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'tieuDe', ma: 'TIEU_DE_KHONG_HOP_LE' }],
        },
        400,
      ),
    );
    const invalid = await httpArticleApi
      .create({ tieuDe: '', noiDung: '', hashtag: [], trangThai: 'BanNhap' })
      .catch((error: unknown) => error);
    expect(invalid).toBeInstanceOf(ApiError);
    expect(invalid).toMatchObject({
      status: 400,
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'tieuDe', ma: 'TIEU_DE_KHONG_HOP_LE' }],
    });

    fetchMock.mockResolvedValueOnce(
      reply(
        {
          maLoi: 'THE_TRUNG_KHONG_DAU',
          thongBao: 'x',
          chiTiet: { theDaCo: 'mặt' },
        },
        409,
      ),
    );
    await expect(
      httpArticleApi.update('1', { hashtag: ['mắt'] }),
    ).rejects.toMatchObject({
      status: 409,
      maLoi: 'THE_TRUNG_KHONG_DAU',
      chiTiet: { theDaCo: 'mặt' },
    });
  });

  it('ABW-12 mất mạng khi ghi ⇒ NetworkError (nơi gọi KHÔNG được tự thử lại: không biết máy chủ đã ghi chưa)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      httpArticleApi.create({
        tieuDe: 'a',
        noiDung: '',
        hashtag: [],
        trangThai: 'BanNhap',
      }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('httpArticleApi.suggestTags', () => {
  it('ABW-12 GET /api/admin/hashtags?q=<tiền tố>&limit=10, trả danh sách tên', async () => {
    answer(reply({ items: [{ ten: 'trẻ-em' }, { ten: 'trẻ-sơ-sinh' }] }));

    expect(await httpArticleApi.suggestTags('trẻ', controller())).toEqual([
      'trẻ-em',
      'trẻ-sơ-sinh',
    ]);
    const call = lastCall();
    expect(call.path).toBe('/api/admin/hashtags');
    expect(call.method).toBe('GET');
    expect(call.query).toEqual({ q: 'trẻ', limit: '10' });
    expect(call.headers.get('Authorization')).toBe(`Bearer ${SESSION_ACCESS}`);
  });

  it('ABW-12 thân sai hình dạng ⇒ UnexpectedResponseError', async () => {
    answer(reply({ items: [{ name: 'a' }] }));

    await expect(
      httpArticleApi.suggestTags('a', controller()),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
