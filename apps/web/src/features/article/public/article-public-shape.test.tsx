import { fireEvent, screen, within } from '@testing-library/react';
import { makePublicItem, makePublicPage } from '../testing/article-fixtures';
import { renderPublicPages } from '../testing/render-public-pages';

// article F2, ABG-14: API trả thân SAI HÌNH DẠNG ở danh sách và chi tiết ⇒ `ErrorState` (có "Thử lại"), KHÔNG trắng trang và không vẽ nửa vời; thẻ phổ biến sai dạng chỉ làm mất chip.
// Đi qua lớp HTTP thật (`httpArticleApi` + `fetch` giả, không Provider) để chứng minh cả chuỗi: kiểm hình dạng ⇒ lỗi ⇒ giao diện. Hợp đồng gọi đúng ở `api/article-public-api.test.ts`.
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Mỗi đường dẫn có một phản hồi; đường dẫn không nêu ⇒ thân rỗng hợp lệ
function serve(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (input) => {
    const { pathname } = new URL(String(input), 'http://localhost');
    return (routes[pathname] ?? (() => json({ items: [] })))();
  });
}

beforeEach(() => {
  document.title = 'CLINIX';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('danh sách: thân sai hình dạng (ABG-14)', () => {
  it.each([
    ['thân là mảng', []],
    ['không có items', { total: 0, page: 1, pageSize: 9 }],
    ['items không phải mảng', { items: 'x', total: 0, page: 1, pageSize: 9 }],
    [
      'bài thiếu mã',
      makePublicPage([{ ...makePublicItem(), baiVietId: undefined } as never]),
    ],
    [
      'bài thiếu tiêu đề',
      makePublicPage([{ ...makePublicItem(), tieuDe: 5 } as never]),
    ],
    [
      'bài thiếu thẻ',
      makePublicPage([{ ...makePublicItem(), hashtag: undefined } as never]),
    ],
    ['total là chuỗi', { items: [], total: '0', page: 1, pageSize: 9 }],
  ])(
    'ABG-14 %s ⇒ ErrorState kèm "Thử lại"; không lưới, không "rỗng"',
    async (_name, body) => {
      serve({ '/api/public/articles': () => json(body) });
      renderPublicPages();

      const alert = await screen.findByRole('alert');
      expect(
        within(alert).getByRole('button', { name: 'Thử lại' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
      expect(screen.queryByText('Không tìm thấy bài viết phù hợp.')).toBeNull();
      // Trang vẫn còn khung: tiêu đề, ô tìm
      expect(
        screen.getByRole('heading', { level: 1, name: 'Cẩm nang sức khỏe' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('searchbox', { name: 'Tìm theo tiêu đề' }),
      ).toBeInTheDocument();
    },
  );

  it('ABG-14 thân sai rồi thử lại gặp thân đúng ⇒ hiện bài, hết lỗi', async () => {
    let first = true;
    serve({
      '/api/public/articles': () => {
        if (first) {
          first = false;
          return json({ nothing: true });
        }
        return json(
          makePublicPage([
            makePublicItem({ baiVietId: '3', tieuDe: 'Bài ba' }),
          ]),
        );
      },
    });
    renderPublicPages();

    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByRole('link', { name: 'Bài ba' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ABG-14 thẻ phổ biến sai dạng ⇒ không chip, KHÔNG báo lỗi; danh sách vẫn hiện', async () => {
    serve({
      '/api/public/articles': () =>
        json(makePublicPage([makePublicItem({ tieuDe: 'Bài ba' })])),
      '/api/public/article-tags': () => json({ items: [{ ten: 5 }] }),
    });
    renderPublicPages();

    expect(
      await screen.findByRole('link', { name: 'Bài ba' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Lọc theo thẻ' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('chi tiết: thân sai hình dạng (ABG-14)', () => {
  it.each([
    ['thiếu nội dung', makePublicItem({ baiVietId: '12' })],
    ['nội dung là số', { ...makePublicItem({ baiVietId: '12' }), noiDung: 5 }],
    ['thiếu tiêu đề', { baiVietId: '12', noiDung: 'x', hashtag: [] }],
    [
      'thiếu thẻ',
      { ...makePublicItem({ baiVietId: '12' }), noiDung: 'x', hashtag: null },
    ],
    ['thân là mảng', []],
    ['thân rỗng', {}],
  ])(
    'ABG-14 %s ⇒ ErrorState kèm "Thử lại", KHÔNG phải khối A2, không h1 của bài, tiêu đề tab không đổi',
    async (_name, body) => {
      serve({ '/api/public/articles/12': () => json(body) });
      renderPublicPages({ path: '/cam-nang/12-sot-xuat-huyet' });

      const alert = await screen.findByRole('alert');
      expect(
        within(alert).getByRole('button', { name: 'Thử lại' }),
      ).toBeInTheDocument();
      expect(alert).not.toHaveTextContent('Bài viết không còn tồn tại');
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      expect(document.title).toBe('CLINIX');
    },
  );

  it('ABG-14 máy chủ trả HTML thay vì JSON (nginx 502) ⇒ ErrorState, không đổ HTML ra màn hình', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response('<html><body>Bad Gateway</body></html>', { status: 502 }),
    );
    renderPublicPages({ path: '/cam-nang/12-x' });

    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('Bad Gateway');
    expect(
      within(alert).getByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument();
  });
});
