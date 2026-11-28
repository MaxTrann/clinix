import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import {
  ApiError,
  NetworkError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  makePublicItem,
  makePublicPage,
  makePublished,
  toPublicDetail,
} from '../testing/article-fixtures';
import { httpArticleApi } from './article-api';

// article F2, ABG-02 (không gửi `chiNhanhId`), ABG-03 (không gửi `the` rỗng), W7 (route công khai KHÔNG gắn Authorization dù đã đăng nhập), ABG-14 (thân sai ⇒ lỗi):
// lớp `httpArticleApi` phần công khai gọi đúng đường dẫn, query, qua lớp client duy nhất. Nếp kiểm lời gọi của `article-api.test.ts`: stub `fetch`, có sẵn phiên đăng nhập
// để lời gọi quên `skipAuthToken` bị lộ.
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
    query: Object.fromEntries(parsed.searchParams),
    method: init?.method,
    headers: new Headers(init?.headers),
  };
}

const signal = () => new AbortController().signal;

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

describe('httpArticleApi.listPublic', () => {
  it('ABG-02 GET /api/public/articles chỉ có page và pageSize (mặc định 9); KHÔNG có q, the, chiNhanhId khi không lọc', async () => {
    const page = makePublicPage([makePublicItem({ baiVietId: '3' })]);
    fetchMock.mockResolvedValueOnce(reply(page));

    expect(await httpArticleApi.listPublic({ page: 1 }, signal())).toEqual(
      page,
    );
    const call = lastCall();
    expect(call.path).toBe('/api/public/articles');
    expect(call.method).toBe('GET');
    expect(call.query).toEqual({ page: '1', pageSize: '9' });
    expect(call.search).not.toContain('chiNhanhId');
    expect(call.search).not.toContain('the=');
  });

  it('ABG-03 có q và the ⇒ gửi đủ (mã hoá); pageSize tuỳ chọn (khối trang chủ 4)', async () => {
    fetchMock.mockResolvedValue(reply(makePublicPage([])));
    await httpArticleApi.listPublic(
      { q: 'đau đầu', the: 'sốt-xuất-huyết', page: 3, pageSize: 4 },
      signal(),
    );
    expect(lastCall().query).toEqual({
      q: 'đau đầu',
      the: 'sốt-xuất-huyết',
      page: '3',
      pageSize: '4',
    });
  });

  it('ABG-03 `the` và `q` là undefined ⇒ khoá vắng hẳn, không có `the=` rỗng (máy chủ trả 400 với `the` rỗng)', async () => {
    fetchMock.mockResolvedValue(reply(makePublicPage([])));
    await httpArticleApi.listPublic(
      { q: undefined, the: undefined, page: 1 },
      signal(),
    );
    expect(lastCall().search).toBe('?page=1&pageSize=9');
  });

  it('W7 đã đăng nhập vẫn KHÔNG gắn Authorization (route công khai dùng skipAuthToken)', async () => {
    fetchMock.mockResolvedValue(reply(makePublicPage([])));
    await httpArticleApi.listPublic({ page: 1 }, signal());
    expect(lastCall().headers.get('Authorization')).toBeNull();
  });

  it('ABG-14 lỗi: thân sai dạng ⇒ UnexpectedResponseError; 400 ⇒ ApiError giữ maLoi và loi[]; mất mạng ⇒ NetworkError', async () => {
    fetchMock.mockResolvedValueOnce(reply({ items: [{ tieuDe: 'thiếu mã' }] }));
    await expect(
      httpArticleApi.listPublic({ page: 1 }, signal()),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);

    fetchMock.mockResolvedValueOnce(
      reply(
        {
          maLoi: 'BO_LOC_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'the', ma: 'THE_KHONG_HOP_LE' }],
        },
        400,
      ),
    );
    await expect(
      httpArticleApi.listPublic({ page: 1 }, signal()),
    ).rejects.toMatchObject({
      status: 400,
      maLoi: 'BO_LOC_KHONG_HOP_LE',
      loi: [{ truong: 'the', ma: 'THE_KHONG_HOP_LE' }],
    });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(
      httpArticleApi.listPublic({ page: 1 }, signal()),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('httpArticleApi.getPublic', () => {
  it('ABG-05 GET /api/public/articles/:id, id được mã hoá, trả chi tiết có noiDung; không Authorization', async () => {
    const detail = toPublicDetail(
      makePublished({ baiVietId: '12', noiDung: 'Nội dung đủ' }),
    );
    // Mỗi lời gọi nhận MỘT phản hồi mới (thân `Response` chỉ đọc được một lần)
    fetchMock.mockImplementation(async () => reply(detail));

    expect(await httpArticleApi.getPublic('12', signal())).toEqual(detail);
    expect(lastCall().path).toBe('/api/public/articles/12');
    expect(lastCall().headers.get('Authorization')).toBeNull();

    await httpArticleApi.getPublic('a/b', signal());
    expect(lastCall().path).toBe('/api/public/articles/a%2Fb');
  });

  it('ABG-07 404 KHONG_TIM_THAY ⇒ ApiError; chi tiết thiếu noiDung ⇒ UnexpectedResponseError (ABG-14)', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404),
    );
    const error = await httpArticleApi
      .getPublic('5', signal())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });

    fetchMock.mockResolvedValueOnce(reply(makePublicItem()));
    await expect(
      httpArticleApi.getPublic('5', signal()),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});

describe('httpArticleApi.listPublicTags', () => {
  it('ABG-03 GET /api/public/article-tags, không tham số, không Authorization, trả { ten, soBai }', async () => {
    fetchMock.mockResolvedValue(
      reply({
        items: [
          { ten: 'sốt', soBai: 4 },
          { ten: 'tim-mạch', soBai: 2 },
        ],
      }),
    );
    expect(await httpArticleApi.listPublicTags(signal())).toEqual([
      { ten: 'sốt', soBai: 4 },
      { ten: 'tim-mạch', soBai: 2 },
    ]);
    const call = lastCall();
    expect(call.path).toBe('/api/public/article-tags');
    expect(call.search).toBe('');
    expect(call.headers.get('Authorization')).toBeNull();
  });

  it('ABG-14 thân sai dạng ⇒ UnexpectedResponseError', async () => {
    fetchMock.mockResolvedValueOnce(reply({ items: [{ ten: 'sốt' }] }));
    await expect(
      httpArticleApi.listPublicTags(signal()),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});

describe('nhóm quản trị không đổi (đối chứng)', () => {
  it('ABW-12 `list` quản trị vẫn gắn Authorization (chỉ nhóm công khai bỏ token)', async () => {
    fetchMock.mockResolvedValue(
      reply({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        demTheoTrangThai: { BanNhap: 0, DaXuatBan: 0, LuuTruAn: 0 },
      }),
    );
    await httpArticleApi.list({ page: 1 }, signal());
    expect(lastCall().path).toBe('/api/admin/articles');
    expect(lastCall().headers.get('Authorization')).toBe(
      `Bearer ${SESSION_ACCESS}`,
    );
  });
});
