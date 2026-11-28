import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { errorMessageFor } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { makePublished } from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { renderPublicPages } from '../testing/render-public-pages';

// article F2: trang chi tiết `/cam-nang/:idSlug`. ABG-05 (gọi đúng id, MỘT h1, thẻ bấm được, thân bài qua trình dựng chữ thuần), ABG-07 (A2: 404 và lỗi mạng khác nhau),
// ABG-09 (tiêu đề tab và meta của chi tiết). Bản giả làm đúng hợp đồng B2; dữ liệu giả. Chuyển hướng về slug chuẩn và id sai dạng ở `article-detail-redirect.test.tsx`.
const ARTICLE = () =>
  makePublished({
    baiVietId: '12',
    tieuDe: 'Sốt xuất huyết',
    moTaNgan: 'Cách phòng ngừa sốt xuất huyết tại nhà.',
    thoiDiemXuatBan: '2026-11-27T20:30:00.000Z',
    hashtag: ['sốt-xuất-huyết', 'trẻ-em'],
    noiDung: [
      '## Dấu hiệu',
      '',
      'Sốt cao đột ngột.',
      'Đau đầu dữ dội.',
      '',
      '- Diệt muỗi',
      '- Đậy kín lu nước',
    ].join('\n'),
  });
const PATH = '/cam-nang/12-sot-xuat-huyet';
const metaDescription = () =>
  document.head
    .querySelector('meta[name="description"]')
    ?.getAttribute('content');

beforeEach(() => {
  document.title = 'CLINIX';
  document.head
    .querySelectorAll('meta[name="description"]')
    .forEach((tag) => tag.remove());
});

describe('chi tiết bài viết: nội dung (ABG-05)', () => {
  it('ABG-05 gọi ĐÚNG id 12 một lần; MỘT h1 là tiêu đề; ngày giờ Việt Nam; thân bài dựng theo khối (h2, đoạn, danh sách)', async () => {
    const api = createFakeArticleApi([ARTICLE()]);
    renderPublicPages({ api, path: PATH });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sốt xuất huyết' }),
    ).toBeInTheDocument();
    expect(api.callsTo('getPublic')).toHaveLength(1);
    expect(api.callsTo('getPublic')[0].args[0]).toBe('12');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const time = screen.getByText('Đăng ngày 28/11/2026');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', '2026-11-27T20:30:00.000Z');

    expect(
      screen.getByRole('heading', { level: 2, name: 'Dấu hiệu' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sốt cao đột ngột\./)).toBeInTheDocument();
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(expect.arrayContaining(['Diệt muỗi', 'Đậy kín lu nước']));
  });

  it('ABG-05 đường dẫn phân cấp Trang chủ › Cẩm nang › tiêu đề bài (mục cuối là trang hiện tại)', async () => {
    renderPublicPages({ api: createFakeArticleApi([ARTICLE()]), path: PATH });
    const crumbs = within(
      await screen.findByRole('navigation', { name: 'Đường dẫn' }),
    );
    await screen.findByRole('heading', { level: 1 });

    expect(crumbs.getByRole('link', { name: 'Trang chủ' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(crumbs.getByRole('link', { name: 'Cẩm nang' })).toHaveAttribute(
      'href',
      '/cam-nang',
    );
    expect(crumbs.getByText('Sốt xuất huyết')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('ABG-05 thẻ là liên kết tới `/cam-nang?the=…` đã mã hoá; bấm ⇒ sang danh sách đang lọc đúng thẻ đó (vòng đi vòng lại có dấu)', async () => {
    const api = createFakeArticleApi([
      ARTICLE(),
      makePublished({
        baiVietId: '13',
        tieuDe: 'Bài khác',
        hashtag: ['trẻ-em'],
        thoiDiemXuatBan: '2026-11-26T03:00:00.000Z',
      }),
    ]);
    const { router } = renderPublicPages({ api, path: PATH });
    const tags = within(
      await screen.findByRole('list', { name: 'Thẻ bài viết' }),
    );

    const link = tags.getByRole('link', { name: '#sốt-xuất-huyết' });
    expect(link).toHaveAttribute(
      'href',
      `/cam-nang?the=${encodeURIComponent('sốt-xuất-huyết')}`,
    );
    expect(tags.getAllByRole('link').map((a) => a.textContent)).toEqual([
      '#sốt-xuất-huyết',
      '#trẻ-em',
    ]);

    fireEvent.click(link);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/cam-nang'),
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Cẩm nang sức khỏe',
      }),
    ).toBeInTheDocument();
    await screen.findAllByRole('heading', { level: 2 });
    const lastList = api.callsTo('listPublic').at(-1)!.args[0];
    expect(lastList).toMatchObject({ the: 'sốt-xuất-huyết', page: 1 });
    expect(
      await screen.findByRole('button', {
        name: '#sốt-xuất-huyết',
        pressed: true,
      }),
    ).toBeInTheDocument();
  });

  it('ABG-05 `moTaNgan` KHÔNG hiện thành đoạn riêng ở trang chi tiết (Đại duyệt 28/11/2026)', async () => {
    renderPublicPages({ api: createFakeArticleApi([ARTICLE()]), path: PATH });
    await screen.findByRole('heading', { level: 1 });
    expect(
      screen.queryByText('Cách phòng ngừa sốt xuất huyết tại nhà.'),
    ).toBeNull();
  });

  it('ABG-05 thiếu thời điểm xuất bản (dữ liệu lệch) ⇒ không dòng ngày; không thẻ ⇒ không danh sách thẻ', async () => {
    const api = createFakeArticleApi([
      makePublished({
        baiVietId: '12',
        tieuDe: 'Sốt xuất huyết',
        thoiDiemXuatBan: null,
        hashtag: [],
      }),
    ]);
    renderPublicPages({ api, path: PATH });
    await screen.findByRole('heading', { level: 1 });

    expect(document.querySelector('time')).toBeNull();
    expect(screen.queryByText(/Đăng ngày|NaN/)).toBeNull();
    expect(screen.queryByRole('list', { name: 'Thẻ bài viết' })).toBeNull();
  });

  it('ABG-05 nội dung và tiêu đề độc hại hiện thành CHỮ (không thành phần tử, không liên kết, không ảnh)', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    const api = createFakeArticleApi([
      makePublished({
        baiVietId: '12',
        tieuDe: `Tiêu đề ${evil}`,
        noiDung: `<script>alert(1)</script>\n\n${evil}\n\njavascript:alert(1) https://example.invalid/x`,
      }),
    ]);
    // Mã không kèm slug ⇒ chuyển hướng về đường chuẩn (slug chỉ gồm a-z, 0-9, `-`), tiêu đề thật vẫn hiện nguyên văn trong h1
    renderPublicPages({ api, path: '/cam-nang/12' });
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        `Tiêu đề ${evil}`,
      ),
    );

    const main = screen.getByRole('main');
    expect(main.querySelector('script')).toBeNull();
    expect(main.querySelector('img')).toBeNull();
    expect(
      within(main).getByText('<script>alert(1)</script>'),
    ).toBeInTheDocument();
    // URL trong chữ không thành liên kết
    expect(
      within(main).queryByRole('link', { name: /example\.invalid/ }),
    ).toBeNull();
    expect(
      within(main).getByText(
        /javascript:alert\(1\) https:\/\/example\.invalid\/x/,
      ),
    ).toBeInTheDocument();
  });

  it('ABG-05 đang tải ⇒ "Đang tải bài viết…" và đường dẫn chưa có tên bài; chưa có h1', async () => {
    const api = createFakeArticleApi([ARTICLE()]);
    const gate = api.hold('getPublic');
    renderPublicPages({ api, path: PATH });

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải bài viết…');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    const crumbs = within(
      screen.getByRole('navigation', { name: 'Đường dẫn' }),
    );
    expect(crumbs.getAllByRole('listitem')).toHaveLength(2);
    await act(async () => gate.release());
    await screen.findByRole('heading', { level: 1 });
  });

  it('ABG-05 đổi sang bài khác (cùng trang) ⇒ gọi id mới, nội dung mới, tiêu đề tab mới', async () => {
    const api = createFakeArticleApi([
      ARTICLE(),
      makePublished({
        baiVietId: '13',
        tieuDe: 'Tiểu đường',
        noiDung: 'Bài mười ba.',
      }),
    ]);
    const { router } = renderPublicPages({ api, path: PATH });
    await screen.findByRole('heading', { level: 1, name: 'Sốt xuất huyết' });
    expect(document.title).toBe('Sốt xuất huyết | CLINIX');

    await act(async () => {
      await router.navigate('/cam-nang/13-tieu-duong');
    });
    await screen.findByRole('heading', { level: 1, name: 'Tiểu đường' });
    expect(api.callsTo('getPublic').map((call) => call.args[0])).toEqual([
      '12',
      '13',
    ]);
    expect(screen.getByText('Bài mười ba.')).toBeInTheDocument();
    expect(document.title).toBe('Tiểu đường | CLINIX');
  });
});

describe('chi tiết bài viết: A2 và lỗi (ABG-07)', () => {
  it('ABG-07 API 404 (không có bài) ⇒ "Bài viết không còn tồn tại hoặc đã được gỡ." kèm liên kết "Quay lại Cẩm nang" về /cam-nang; không h1 của bài', async () => {
    renderPublicPages({
      api: createFakeArticleApi([]),
      path: '/cam-nang/99-khong-co',
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Bài viết không còn tồn tại hoặc đã được gỡ.',
    );
    expect(
      within(alert).getByRole('link', { name: 'Quay lại Cẩm nang' }),
    ).toHaveAttribute('href', '/cam-nang');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('ABG-07 bài nháp và bài lưu trữ cũng ra CÙNG A2 (không lộ bài có tồn tại), đúng một lời gọi mỗi lần', async () => {
    for (const trangThai of ['BanNhap', 'LuuTruAn'] as const) {
      const api = createFakeArticleApi([
        makePublished({ baiVietId: '5', tieuDe: 'Nháp', trangThai }),
      ]);
      const view = renderPublicPages({ api, path: '/cam-nang/5-nhap' });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Bài viết không còn tồn tại hoặc đã được gỡ.',
      );
      expect(api.callsTo('getPublic')).toHaveLength(1);
      view.unmount();
    }
  });

  it('ABG-07 bấm "Quay lại Cẩm nang" ⇒ sang danh sách', async () => {
    const { router } = renderPublicPages({
      api: createFakeArticleApi(),
      path: '/cam-nang/99',
    });
    fireEvent.click(
      await screen.findByRole('link', { name: 'Quay lại Cẩm nang' }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/cam-nang'),
    );
  });

  it.each([
    ['mất mạng', () => new NetworkError()],
    ['hết giờ', () => new TimeoutError()],
    [
      'lỗi máy chủ 500',
      () => new ApiError(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
    ],
    // 404 nhưng KHÔNG phải mã KHONG_TIM_THAY: web chọn theo MÃ, nên đây là lỗi thường có "Thử lại"
    ['404 mã lạ', () => new ApiError(404, { maLoi: 'MA_LA', thongBao: 'x' })],
  ])(
    'ABG-07 %s ⇒ lỗi kèm "Thử lại" (KHÁC A2); thử lại thành công ⇒ hiện bài',
    async (_name, makeError) => {
      const api = createFakeArticleApi([ARTICLE()]);
      const error = makeError();
      api.failNext('getPublic', error);
      renderPublicPages({ api, path: PATH });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(errorMessageFor(error));
      expect(alert).not.toHaveTextContent('Bài viết không còn tồn tại');
      expect(
        screen.queryByRole('link', { name: 'Quay lại Cẩm nang' }),
      ).toBeNull();

      fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
      await screen.findByRole('heading', { level: 1, name: 'Sốt xuất huyết' });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(api.callsTo('getPublic')).toHaveLength(2);
    },
  );
});

describe('chi tiết bài viết: tiêu đề tab và mô tả (ABG-09)', () => {
  it('ABG-09 đặt "{tiêu đề} | CLINIX" và meta description là moTaNgan; rời trang thì trả lại', async () => {
    const { unmount } = renderPublicPages({
      api: createFakeArticleApi([ARTICLE()]),
      path: PATH,
    });
    await screen.findByRole('heading', { level: 1 });

    expect(document.title).toBe('Sốt xuất huyết | CLINIX');
    expect(metaDescription()).toBe('Cách phòng ngừa sốt xuất huyết tại nhà.');

    unmount();
    expect(document.title).toBe('CLINIX');
    expect(document.head.querySelector('meta[name="description"]')).toBeNull();
  });

  it('ABG-09 thiếu moTaNgan ⇒ meta description là phụ đề của trang Cẩm nang', async () => {
    const api = createFakeArticleApi([
      makePublished({
        baiVietId: '12',
        tieuDe: 'Sốt xuất huyết',
        moTaNgan: null,
      }),
    ]);
    renderPublicPages({ api, path: PATH });
    await screen.findByRole('heading', { level: 1 });
    expect(metaDescription()).toBe(
      'Kiến thức y tế hữu ích từ đội ngũ chuyên gia CLINIX',
    );
  });

  it('ABG-09 KHÔNG đặt khi đang tải, lỗi, A2 (404) và mã sai dạng', async () => {
    // Đang tải
    const api = createFakeArticleApi([ARTICLE()]);
    const gate = api.hold('getPublic');
    const loading = renderPublicPages({ api, path: PATH });
    expect(document.title).toBe('CLINIX');
    expect(metaDescription()).toBeUndefined();
    await act(async () => gate.release());
    await screen.findByRole('heading', { level: 1 });
    loading.unmount();

    // Lỗi mạng
    const failing = createFakeArticleApi([ARTICLE()]);
    failing.failNext('getPublic', new NetworkError());
    const errored = renderPublicPages({ api: failing, path: PATH });
    await screen.findByRole('alert');
    expect(document.title).toBe('CLINIX');
    expect(metaDescription()).toBeUndefined();
    errored.unmount();

    // A2
    const gone = renderPublicPages({
      api: createFakeArticleApi([]),
      path: '/cam-nang/9',
    });
    await screen.findByRole('alert');
    expect(document.title).toBe('CLINIX');
    expect(metaDescription()).toBeUndefined();
    gone.unmount();

    // Mã sai dạng
    renderPublicPages({
      api: createFakeArticleApi([ARTICLE()]),
      path: '/cam-nang/abc',
    });
    await screen.findByRole('heading', { name: 'Không tìm thấy trang' });
    expect(document.title).toBe('CLINIX');
    expect(metaDescription()).toBeUndefined();
  });

  it('ABG-09 tiêu đề độc hại được gán như chữ vào document.title (không thành phần tử)', async () => {
    const evil = '<script>alert(1)</script>';
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '12', tieuDe: evil, moTaNgan: evil }),
    ]);
    renderPublicPages({ api, path: '/cam-nang/12-script-alert-1-script' });
    await waitFor(() => expect(document.title).toBe(`${evil} | CLINIX`));
    expect(metaDescription()).toBe(evil);
    expect(document.head.querySelector('script')).toBeNull();
  });
});
