import { screen, within } from '@testing-library/react';
import { makePublished, toPublicDetail } from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { resetSession } from '../testing/rating-session';
import { renderPublicPages } from '../testing/render-public-pages';

// article F3: khối "Bài viết có ích không?" trong trang chi tiết công khai (PLAN 5.12, 5.13). ABU-12: chi tiết thiếu hay sai kiểu hai số đếm ⇒ `ErrorState` (không trắng trang, không khối nửa vời);
// vị trí: dưới thân bài, trong `<article>`; không thêm `h1`, `h2`. Hợp đồng gọi đúng ở `api/article-rating-api.test.ts`, hành vi nút ở thư mục `rating/`.
const fetchMock = vi.fn<typeof fetch>();
const PATH = '/cam-nang/12-sot-xuat-huyet';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const ARTICLE = () =>
  makePublished({
    baiVietId: '12',
    tieuDe: 'Sốt xuất huyết',
    noiDung: ['## Dấu hiệu', '', 'Sốt cao đột ngột.'].join('\n'),
  });

function serve(body: unknown) {
  fetchMock.mockImplementation(async (input) => {
    const { pathname } = new URL(String(input), 'http://localhost');
    return pathname === '/api/public/articles/12'
      ? json(body)
      : json({ items: [] });
  });
}

beforeEach(() => {
  resetSession();
  document.title = 'CLINIX';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chi tiết: vị trí của khối đánh giá', () => {
  it('ABU-07 khối nằm TRONG <article>, SAU thân bài; không thêm h1 hay đề mục', async () => {
    const api = createFakeArticleApi([ARTICLE()]);
    api.seedRatings('12', { thich: 3, khongThich: 1 });
    renderPublicPages({ api, path: PATH });

    const group = await screen.findByRole('group', {
      name: 'Bài viết có ích không?',
    });
    const article = group.closest('article');
    expect(article).not.toBeNull();
    const body = within(article!).getByText('Sốt cao đột ngột.');
    expect(
      body.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });

  it('ABU-07 hai số đếm của chi tiết hiện đúng (phiên chưa rõ ⇒ chữ "n lượt …")', async () => {
    const api = createFakeArticleApi([ARTICLE()]);
    api.seedRatings('12', { thich: 3, khongThich: 1 });
    renderPublicPages({ api, path: PATH });

    const group = await screen.findByRole('group', {
      name: 'Bài viết có ích không?',
    });
    expect(within(group).getByText('3 lượt Thích')).toBeInTheDocument();
    expect(within(group).getByText('1 lượt Không thích')).toBeInTheDocument();
  });

  it('ABU-07 bài chưa ai đánh giá ⇒ "0 lượt Thích" và "0 lượt Không thích"', async () => {
    const api = createFakeArticleApi([ARTICLE()]);
    renderPublicPages({ api, path: PATH });

    const group = await screen.findByRole('group', {
      name: 'Bài viết có ích không?',
    });
    expect(within(group).getByText('0 lượt Thích')).toBeInTheDocument();
    expect(within(group).getByText('0 lượt Không thích')).toBeInTheDocument();
  });

  it('ABU-07 khối KHÔNG hiện ở trạng thái đang tải, 404 (A2) và lỗi: chỉ khi bài đã sẵn sàng', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '12', trangThai: 'BanNhap' }),
    ]);
    renderPublicPages({ api, path: PATH });

    expect(
      await screen.findByText('Bài viết không còn tồn tại hoặc đã được gỡ.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Bài viết có ích không?' }),
    ).toBeNull();
  });
});

describe('chi tiết: thân thiếu hay sai kiểu hai số đếm (ABU-12)', () => {
  const full = () =>
    toPublicDetail(ARTICLE(), { luotThich: 3, luotKhongThich: 1 });

  it('ABU-12 thân đủ 9 khoá qua lớp HTTP thật ⇒ khối hiện đúng số; chi tiết gọi KHÔNG kèm Authorization', async () => {
    serve(full());
    renderPublicPages({ path: PATH });

    const group = await screen.findByRole('group', {
      name: 'Bài viết có ích không?',
    });
    expect(within(group).getByText('3 lượt Thích')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/api/public/articles/12'),
    )!;
    expect(new Headers(init?.headers).get('Authorization')).toBeNull();
  });

  it.each([
    ['thiếu luotThich', { ...full(), luotThich: undefined }],
    ['thiếu luotKhongThich', { ...full(), luotKhongThich: undefined }],
    ['luotThich là chuỗi', { ...full(), luotThich: '3' }],
    ['luotKhongThich là null', { ...full(), luotKhongThich: null }],
    ['luotThich âm', { ...full(), luotThich: -1 }],
    ['luotKhongThich lẻ', { ...full(), luotKhongThich: 1.5 }],
  ])(
    'ABU-12 %s ⇒ ErrorState kèm "Thử lại", KHÔNG phải khối A2, không h1 của bài, không khối đánh giá, tiêu đề tab không đổi',
    async (_name, body) => {
      serve(body);
      renderPublicPages({ path: PATH });

      const alert = await screen.findByRole('alert');
      expect(
        within(alert).getByRole('button', { name: 'Thử lại' }),
      ).toBeInTheDocument();
      expect(alert).not.toHaveTextContent('Bài viết không còn tồn tại');
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      expect(
        screen.queryByRole('group', { name: 'Bài viết có ích không?' }),
      ).toBeNull();
      expect(document.title).toBe('CLINIX');
    },
  );
});
