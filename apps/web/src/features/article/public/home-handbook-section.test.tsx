import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NetworkError } from '../../../shared/api/errors';
import {
  resetSelectedBranchForTest,
  useSelectedBranch,
} from '../../../shared/branch-selection';
import type { ArticleApi } from '../api/article-api';
import { ArticleApiContext } from '../api/article-api-context';
import {
  makeManyPublished,
  makePublicItem,
  makePublicPage,
  makePublished,
} from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { HomeHandbookSection } from './home-handbook-section';

// article F2, ABG-10 và ABG-12: khối "Cẩm nang sức khỏe" ở trang chủ. Tối đa 4 bài mới nhất và "Xem tất cả"; KHÔNG VẼ GÌ khi đang tải, lỗi, rỗng hay thân sai dạng
// (không báo lỗi giữa trang chủ, không nhấp nháy khối rỗng). Bản giả làm đúng hợp đồng B2; ca thân sai dạng đi qua lớp HTTP thật với `fetch` giả.
function renderSection(api?: ArticleApi) {
  const tree = (
    <MemoryRouter>
      <HomeHandbookSection />
    </MemoryRouter>
  );
  return render(
    api === undefined ? (
      tree
    ) : (
      <ArticleApiContext.Provider value={api}>
        {tree}
      </ArticleApiContext.Provider>
    ),
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('khối trang chủ: có bài (ABG-10)', () => {
  it('ABG-10 tối đa 4 bài mới nhất; tiêu đề "Cẩm nang sức khỏe", mô tả, "Xem tất cả" ⇒ /cam-nang; thẻ bài là liên kết tới id-slug; gọi trang 1 cỡ 4', async () => {
    const api = createFakeArticleApi(makeManyPublished(6));
    const { container } = renderSection(api);

    const region = await screen.findByRole('region', {
      name: 'Cẩm nang sức khỏe',
    });
    expect(
      within(region).getByRole('heading', {
        level: 2,
        name: 'Cẩm nang sức khỏe',
      }),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(
        'Kiến thức y tế hữu ích từ đội ngũ chuyên gia CLINIX',
      ),
    ).toBeInTheDocument();
    expect(
      within(region).getByRole('link', { name: 'Xem tất cả' }),
    ).toHaveAttribute('href', '/cam-nang');

    const titles = within(region).getAllByRole('heading', { level: 3 });
    expect(titles.map((title) => title.textContent)).toEqual([
      'Bài 1',
      'Bài 2',
      'Bài 3',
      'Bài 4',
    ]);
    expect(within(region).getByRole('link', { name: 'Bài 1' })).toHaveAttribute(
      'href',
      '/cam-nang/1-bai-1',
    );
    expect(api.callsTo('listPublic')).toHaveLength(1);
    expect(api.callsTo('listPublic')[0].args[0]).toEqual({
      page: 1,
      pageSize: 4,
    });
    // chỉ MỘT h2 (tiêu đề khối); thẻ bài là h3 dưới nó
    expect(container.querySelectorAll('h2')).toHaveLength(1);
  });

  it('ABG-10 máy chủ lỡ trả nhiều hơn 4 bài ⇒ vẫn chỉ hiện 4 (không tin cỡ trang phía máy chủ)', async () => {
    const six = Array.from({ length: 6 }, (_, index) =>
      makePublicItem({
        baiVietId: String(index + 1),
        tieuDe: `Bài ${index + 1}`,
      }),
    );
    const api: ArticleApi = {
      ...createFakeArticleApi(),
      listPublic: async () => makePublicPage(six, { pageSize: 4 }),
    };
    renderSection(api);
    await screen.findByRole('region', { name: 'Cẩm nang sức khỏe' });
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
  });

  it('ABG-10 chỉ có 1 bài ⇒ vẫn vẽ khối với 1 thẻ; bài nháp và lưu trữ không lọt vào khối', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '1', tieuDe: 'Bài đã xuất bản' }),
      makePublished({
        baiVietId: '2',
        tieuDe: 'Bài nháp',
        trangThai: 'BanNhap',
      }),
      makePublished({
        baiVietId: '3',
        tieuDe: 'Bài lưu trữ',
        trangThai: 'LuuTruAn',
      }),
    ]);
    renderSection(api);
    await screen.findByRole('region', { name: 'Cẩm nang sức khỏe' });
    expect(
      screen
        .getAllByRole('heading', { level: 3 })
        .map((title) => title.textContent),
    ).toEqual(['Bài đã xuất bản']);
  });
});

describe('khối trang chủ: KHÔNG vẽ gì (ABG-10)', () => {
  it('ABG-10 đang tải ⇒ không vẽ gì (không tiêu đề, không "Đang tải"); khi bài về mới hiện', async () => {
    const api = createFakeArticleApi(makeManyPublished(2));
    const gate = api.hold('listPublic');
    const { container } = renderSection(api);

    expect(container).toBeEmptyDOMElement();
    await act(async () => gate.release());
    expect(
      await screen.findByRole('region', { name: 'Cẩm nang sức khỏe' }),
    ).toBeVisible();
  });

  it('ABG-10 lỗi (mất mạng) ⇒ không vẽ gì: không tiêu đề "Cẩm nang", không thông báo lỗi, không "Thử lại"', async () => {
    const api = createFakeArticleApi(makeManyPublished(2));
    api.failNext('listPublic', new NetworkError());
    const { container } = renderSection(api);

    await waitFor(() => expect(api.callsTo('listPublic')).toHaveLength(1));
    await sleep(30);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading', { name: /Cẩm nang/ })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ABG-10 rỗng (chưa có bài đã xuất bản) ⇒ không vẽ gì, kể cả "Xem tất cả"', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '1', trangThai: 'BanNhap' }),
    ]);
    const { container } = renderSection(api);

    await waitFor(() => expect(api.callsTo('listPublic')).toHaveLength(1));
    await sleep(30);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('link', { name: 'Xem tất cả' })).toBeNull();
  });
});

describe('khối trang chủ: qua lớp HTTP thật (ABG-10, ABG-14)', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ABG-10 gọi GET /api/public/articles?page=1&pageSize=4 (không Authorization, không chiNhanhId) và vẽ khối', async () => {
    fetchMock.mockImplementation(async () =>
      json(
        makePublicPage([makePublicItem({ baiVietId: '3', tieuDe: 'Bài ba' })], {
          pageSize: 4,
        }),
      ),
    );
    renderSection();

    expect(
      await screen.findByRole('region', { name: 'Cẩm nang sức khỏe' }),
    ).toBeVisible();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/public/articles?page=1&pageSize=4');
    expect(new Headers(init?.headers).get('Authorization')).toBeNull();
  });

  it.each([
    ['thân là mảng', []],
    ['thân là chuỗi', 'x'],
    ['không có items', { total: 0 }],
    ['items không phải mảng', { items: 'x', total: 0, page: 1, pageSize: 4 }],
    [
      'bài thiếu tiêu đề',
      makePublicPage([{ ...makePublicItem(), tieuDe: undefined } as never]),
    ],
    [
      'bài thiếu thẻ',
      makePublicPage([{ ...makePublicItem(), hashtag: null } as never]),
    ],
    ['thiếu total', { items: [makePublicItem()], page: 1, pageSize: 4 }],
    // Thân của một route công khai KHÁC (thông tin phòng khám): thân hợp lệ nhưng sai dạng với danh sách bài
    ['thân của route khác', { tenThuongHieu: 'CLINIX', diaChiTruSo: null }],
  ])('ABG-14 %s ⇒ không vẽ gì, không báo lỗi', async (_name, body) => {
    fetchMock.mockImplementation(async () => json(body));
    const { container } = renderSection();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await sleep(30);
    expect(container).toBeEmptyDOMElement();
  });

  it('ABG-10 lỗi máy chủ 500 và lỗi mạng thật (fetch ném) ⇒ không vẽ gì', async () => {
    fetchMock.mockImplementationOnce(async () =>
      json({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500),
    );
    const first = renderSection();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await sleep(30);
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const second = renderSection();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await sleep(30);
    expect(second.container).toBeEmptyDOMElement();
  });
});

describe('khối trang chủ: không phụ thuộc chi nhánh (ABG-12)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSelectedBranchForTest();
  });

  function BranchControl() {
    const { select } = useSelectedBranch();
    return (
      <button onClick={() => select('2', 'NguoiDung')}>
        Chọn chi nhánh mẫu
      </button>
    );
  }

  it('ABG-12 đổi chi nhánh đang chọn ⇒ không gọi lại danh sách bài của khối', async () => {
    const api = createFakeArticleApi(makeManyPublished(2));
    render(
      <ArticleApiContext.Provider value={api}>
        <MemoryRouter>
          <BranchControl />
          <HomeHandbookSection />
        </MemoryRouter>
      </ArticleApiContext.Provider>,
    );
    await screen.findByRole('region', { name: 'Cẩm nang sức khỏe' });
    expect(api.callsTo('listPublic')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Chọn chi nhánh mẫu' }));
    await sleep(80);
    expect(api.callsTo('listPublic')).toHaveLength(1);
    expect(
      screen.getByRole('region', { name: 'Cẩm nang sức khỏe' }),
    ).toBeVisible();
  });
});
