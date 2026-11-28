import { screen, waitFor } from '@testing-library/react';
import { makePublished } from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { renderPublicPages } from '../testing/render-public-pages';

// article F2, ABG-06 (PLAN article Q3, T3): đường chuẩn `id-slug`; sai slug ⇒ `<Navigate replace>` về đường chuẩn (không thêm mục lịch sử, không gọi API lần hai);
// mã sai dạng (`abc`, `0`, `12abc`) ⇒ trang 404 chung và KHÔNG gọi API. Bản giả làm đúng hợp đồng B2; dữ liệu giả.
const ARTICLE = () =>
  makePublished({
    baiVietId: '12',
    tieuDe: 'Sốt xuất huyết',
    noiDung: 'Nội dung.',
  });
const CANONICAL = '/cam-nang/12-sot-xuat-huyet';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('chuyển hướng về đường chuẩn (ABG-06)', () => {
  it.each([
    ['thiếu slug', '/cam-nang/12'],
    ['slug sai', '/cam-nang/12-sai'],
    ['slug rỗng sau dấu gạch', '/cam-nang/12-'],
    [
      'slug có dấu và chữ hoa',
      `/cam-nang/12-${encodeURIComponent('Sốt-Xuất-Huyết')}`,
    ],
    ['slug thừa một đoạn', '/cam-nang/12-sot-xuat-huyet-them'],
  ])(
    'ABG-06 %s ⇒ chuyển hướng THAY mục lịch sử về %s, chỉ MỘT lời gọi API',
    async (_name, path) => {
      const api = createFakeArticleApi([ARTICLE()]);
      const { router } = renderPublicPages({ api, path });

      await screen.findByRole('heading', { level: 1, name: 'Sốt xuất huyết' });
      expect(router.state.location.pathname).toBe(CANONICAL);
      // REPLACE: nút Quay lại không dẫn về đường dẫn sai
      expect(router.state.historyAction).toBe('REPLACE');
      expect(api.callsTo('getPublic')).toHaveLength(1);
      expect(api.callsTo('getPublic')[0].args[0]).toBe('12');
    },
  );

  it('ABG-06 đã là đường chuẩn ⇒ ở nguyên, không chuyển hướng (historyAction vẫn là POP)', async () => {
    const api = createFakeArticleApi([ARTICLE()]);
    const { router } = renderPublicPages({ api, path: CANONICAL });

    await screen.findByRole('heading', { level: 1 });
    expect(router.state.location.pathname).toBe(CANONICAL);
    expect(router.state.historyAction).toBe('POP');
    expect(api.callsTo('getPublic')).toHaveLength(1);
  });

  it('ABG-06 tiêu đề không còn chữ nào sau khi bỏ dấu ⇒ đường chuẩn chỉ còn mã bài: `/cam-nang/12-x` về `/cam-nang/12`, `/cam-nang/12` ở nguyên', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '12', tieuDe: '!!!', noiDung: 'Nội dung.' }),
    ]);
    const { router } = renderPublicPages({ api, path: '/cam-nang/12-x' });
    await screen.findByRole('heading', { level: 1, name: '!!!' });
    expect(router.state.location.pathname).toBe('/cam-nang/12');
    expect(router.state.historyAction).toBe('REPLACE');

    const again = createFakeArticleApi([
      makePublished({ baiVietId: '12', tieuDe: '!!!' }),
    ]);
    const second = renderPublicPages({ api: again, path: '/cam-nang/12' });
    await screen.findAllByRole('heading', { level: 1, name: '!!!' });
    expect(second.router.state.historyAction).toBe('POP');
  });

  it('ABG-06 tiêu đề dài ⇒ slug cắt 80 ký tự; đường chuẩn không kết thúc bằng dấu gạch', async () => {
    const api = createFakeArticleApi([
      makePublished({
        baiVietId: '7',
        tieuDe: `${'abc '.repeat(40)}`,
        noiDung: 'x',
      }),
    ]);
    const { router } = renderPublicPages({ api, path: '/cam-nang/7' });
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/cam-nang\/7-[a-z-]+$/),
    );
    const slug = router.state.location.pathname.replace('/cam-nang/7-', '');
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('ABG-06 bài nháp hay không có: KHÔNG chuyển hướng (chưa có tiêu đề để lập slug) mà ra A2', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '5', tieuDe: 'Nháp', trangThai: 'BanNhap' }),
    ]);
    const { router } = renderPublicPages({ api, path: '/cam-nang/5-sai' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bài viết không còn tồn tại hoặc đã được gỡ.',
    );
    expect(router.state.location.pathname).toBe('/cam-nang/5-sai');
  });
});

describe('mã sai dạng ⇒ trang 404 chung, không gọi API (ABG-06)', () => {
  it.each([
    'abc',
    '0',
    '0-x',
    '012',
    '12abc',
    '12abc-sot',
    '-12',
    '%2012',
    '1'.repeat(20),
  ])(
    'ABG-06 `/cam-nang/%s` ⇒ "Không tìm thấy trang", 0 lời gọi API, đường dẫn giữ nguyên',
    async (raw) => {
      const api = createFakeArticleApi([ARTICLE()]);
      const { router } = renderPublicPages({ api, path: `/cam-nang/${raw}` });

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Không tìm thấy trang',
        }),
      ).toBeInTheDocument();
      await sleep(30);
      expect(api.calls).toHaveLength(0);
      expect(
        screen.queryByRole('heading', { name: 'Sốt xuất huyết' }),
      ).toBeNull();
      expect(router.state.location.pathname).toBe(`/cam-nang/${raw}`);
    },
  );

  it('ABG-06 biên: mã 19 chữ số hợp lệ về dạng ⇒ CÓ gọi API (máy chủ trả 404 ⇒ A2); mã `1` hợp lệ', async () => {
    const api = createFakeArticleApi([]);
    renderPublicPages({ api, path: `/cam-nang/${'9'.repeat(19)}` });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bài viết không còn tồn tại hoặc đã được gỡ.',
    );
    expect(api.callsTo('getPublic')).toHaveLength(1);
  });
});
