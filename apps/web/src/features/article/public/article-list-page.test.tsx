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
import {
  resetSelectedBranchForTest,
  useSelectedBranch,
} from '../../../shared/branch-selection';
import type { PublicArticleListQuery } from '../api/article-types';
import { makeManyPublished, makePublished } from '../testing/article-fixtures';
import {
  createFakeArticleApi,
  type FakeArticleApi,
} from '../testing/fake-article-api';
import { renderPublicPages } from '../testing/render-public-pages';

// article F2, ABG-02 (thẻ bài, ngày giờ Việt Nam, tối đa 3 thẻ, khung dự phòng, phân trang, tải, lỗi, mất mạng, không gửi chiNhanhId), ABG-04 (A1), ABG-09 (tiêu đề tab và mô tả của danh sách)
// và ABG-12 (đổi chi nhánh không gọi lại). Bản giả `createFakeArticleApi` làm đúng hợp đồng B2; dữ liệu giả.
const cards = () =>
  screen.getAllByRole('heading', { level: 2 }).map((h) => h.closest('li')!);
const cardTitles = () =>
  cards().map((card) => within(card).getByRole('link').textContent);
const waitForCards = () => screen.findAllByRole('heading', { level: 2 });
const lastQuery = (api: FakeArticleApi) =>
  api.callsTo('listPublic').at(-1)!.args[0] as PublicArticleListQuery;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  document.title = 'CLINIX';
  window.localStorage.clear();
  resetSelectedBranchForTest();
});

describe('danh sách công khai: trạng thái tải và nội dung (ABG-02)', () => {
  it('ABG-02 đang tải ⇒ "Đang tải bài viết…" rồi lưới thẻ; một h1 "Cẩm nang sức khỏe", phụ đề, đường dẫn Trang chủ › Cẩm nang', async () => {
    const api = createFakeArticleApi(makeManyPublished(3));
    const gate = api.hold('listPublic');
    renderPublicPages({ api });

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải bài viết…');
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    await act(async () => gate.release());

    await waitForCards();
    expect(cardTitles()).toEqual(['Bài 1', 'Bài 2', 'Bài 3']);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Cẩm nang sức khỏe' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Kiến thức y tế hữu ích từ đội ngũ chuyên gia CLINIX'),
    ).toBeInTheDocument();
    const crumbs = within(
      screen.getByRole('navigation', { name: 'Đường dẫn' }),
    );
    expect(crumbs.getByRole('link', { name: 'Trang chủ' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(crumbs.getByText('Cẩm nang')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('ABG-02 thẻ bài: tiêu đề là liên kết tới `id-slug`, mô tả, ngày `dd/MM/yyyy` THEO GIỜ VIỆT NAM (20:30 UTC là 03:30 hôm sau), tối đa 3 thẻ, khung dự phòng (không có ảnh thật)', async () => {
    const api = createFakeArticleApi([
      makePublished({
        baiVietId: '12',
        tieuDe: 'Sốt xuất huyết',
        moTaNgan: 'Cách phòng ngừa tại nhà.',
        thoiDiemXuatBan: '2026-11-27T20:30:00.000Z',
        hashtag: ['sốt', 'trẻ-em', 'muỗi', 'thẻ-thứ-tư'],
        anhDaiDien: null,
      }),
    ]);
    renderPublicPages({ api });
    await waitForCards();

    const [card] = cards();
    const link = within(card).getByRole('link', { name: 'Sốt xuất huyết' });
    expect(link).toHaveAttribute('href', '/cam-nang/12-sot-xuat-huyet');
    expect(
      within(card).getByText('Cách phòng ngừa tại nhà.'),
    ).toBeInTheDocument();
    const time = within(card).getByText('28/11/2026');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', '2026-11-27T20:30:00.000Z');
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((tag) => tag.textContent),
    ).toEqual(['#sốt', '#trẻ-em', '#muỗi']);
    expect(within(card).queryByText('#thẻ-thứ-tư')).toBeNull();
    // Thẻ (hashtag) ở thẻ bài là chữ, không phải liên kết lồng trong liên kết
    expect(within(card).getAllByRole('link')).toHaveLength(1);
    // Khung dự phòng: trang trí (aria-hidden), không có ảnh
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('ABG-02 biên: đúng 3 thẻ hiện đủ; không thẻ ⇒ không có danh sách thẻ; mô tả null hay rỗng ⇒ không có đoạn mô tả', async () => {
    const api = createFakeArticleApi([
      makePublished({
        baiVietId: '1',
        tieuDe: 'Ba thẻ',
        hashtag: ['a', 'b', 'c'],
      }),
      makePublished({
        baiVietId: '2',
        tieuDe: 'Không thẻ',
        hashtag: [],
        moTaNgan: null,
        thoiDiemXuatBan: '2026-11-27T00:00:00.000Z',
      }),
      makePublished({
        baiVietId: '3',
        tieuDe: 'Mô tả rỗng',
        hashtag: [],
        moTaNgan: '',
        thoiDiemXuatBan: '2026-11-26T00:00:00.000Z',
      }),
    ]);
    renderPublicPages({ api });
    await waitForCards();

    const [three, none, empty] = cards();
    expect(within(three).getAllByRole('listitem')).toHaveLength(3);
    expect(within(none).queryByRole('list')).toBeNull();
    expect(none.querySelectorAll('p')).toHaveLength(0);
    expect(empty.querySelectorAll('p')).toHaveLength(0);
  });

  it('ABG-02 biên: thời điểm xuất bản null (dữ liệu lệch) ⇒ không dòng ngày, không in "NaN" hay "—", bài vẫn hiện', async () => {
    const api = createFakeArticleApi([
      makePublished({
        baiVietId: '1',
        tieuDe: 'Thiếu ngày',
        thoiDiemXuatBan: null,
      }),
    ]);
    renderPublicPages({ api });
    await waitForCards();

    const [card] = cards();
    expect(card.querySelector('time')).toBeNull();
    expect(card.textContent).not.toMatch(/NaN|—|Invalid/);
    expect(
      within(card).getByRole('link', { name: 'Thiếu ngày' }),
    ).toBeInTheDocument();
  });

  it('ABG-02 gọi API với trang 1 và KHÔNG có chiNhanhId; không có q và the khi không lọc', async () => {
    const api = createFakeArticleApi(makeManyPublished(2));
    renderPublicPages({ api });
    await waitForCards();

    expect(api.callsTo('listPublic')).toHaveLength(1);
    expect(lastQuery(api)).toEqual({ page: 1 });
    for (const call of api.calls) {
      expect(JSON.stringify(call.args)).not.toContain('chiNhanhId');
    }
  });
});

describe('danh sách công khai: phân trang (ABG-02)', () => {
  it('ABG-02 20 bài ⇒ 9 + 9 + 2: "Trang n/m", "Trang trước" tắt ở trang 1, "Trang sau" tắt ở trang cuối, trang lên URL', async () => {
    const api = createFakeArticleApi(makeManyPublished(20));
    const { router } = renderPublicPages({ api });
    await waitForCards();

    const nav = () => screen.getByRole('navigation', { name: 'Phân trang' });
    expect(cards()).toHaveLength(9);
    expect(within(nav()).getByText('Trang 1/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(cardTitles()[0]).toBe('Bài 10'));
    expect(lastQuery(api).page).toBe(2);
    expect(router.state.location.search).toBe('?trang=2');
    expect(within(nav()).getByText('Trang 2/3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    expect(within(nav()).getByText('Trang 3/3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    await waitFor(() => expect(cards()).toHaveLength(9));
    expect(router.state.location.search).toBe('?trang=2');
  });

  it('ABG-02 biên: đúng 9 bài (một trang) và 10 bài (hai trang) ⇒ chỉ 10 bài mới có phân trang', async () => {
    const nine = renderPublicPages({
      api: createFakeArticleApi(makeManyPublished(9)),
    });
    await waitForCards();
    expect(screen.queryByRole('navigation', { name: 'Phân trang' })).toBeNull();
    nine.unmount();

    renderPublicPages({ api: createFakeArticleApi(makeManyPublished(10)) });
    await waitForCards();
    expect(screen.getByText('Trang 1/2')).toBeInTheDocument();
  });
});

describe('danh sách công khai: lỗi và mất mạng (ABG-02)', () => {
  it.each([
    ['mất mạng', () => new NetworkError()],
    ['hết giờ', () => new TimeoutError()],
    [
      'lỗi máy chủ 500',
      () => new ApiError(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
    ],
  ])(
    'ABG-02 %s ⇒ thông báo lỗi kèm "Thử lại"; thử lại thành công ⇒ hiện bài',
    async (_name, makeError) => {
      const api = createFakeArticleApi(makeManyPublished(2));
      const error = makeError();
      api.failNext('listPublic', error);
      renderPublicPages({ api });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(errorMessageFor(error));
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull();

      fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
      await waitForCards();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(cards()).toHaveLength(2);
      expect(api.callsTo('listPublic')).toHaveLength(2);
    },
  );

  it('ABG-02 thẻ phổ biến lỗi ⇒ không có chip, KHÔNG báo lỗi; danh sách vẫn dùng được', async () => {
    const api = createFakeArticleApi(makeManyPublished(2));
    api.failNext('listPublicTags', new NetworkError());
    renderPublicPages({ api });
    await waitForCards();

    expect(screen.queryByRole('group', { name: 'Lọc theo thẻ' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('danh sách công khai: A1 danh sách rỗng (ABG-04)', () => {
  it('ABG-04 không bài nào khớp ⇒ "Không tìm thấy bài viết phù hợp." kèm "Xoá bộ lọc"; bấm ⇒ URL trống, ô tìm trống, gọi lại không q, bài hiện lại', async () => {
    const api = createFakeArticleApi(makeManyPublished(3));
    const { router } = renderPublicPages({
      api,
      path: `/cam-nang?${new URLSearchParams({ q: 'không có bài nào' })}`,
    });

    expect(
      await screen.findByText('Không tìm thấy bài viết phù hợp.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Tìm theo tiêu đề' }),
    ).toHaveValue('không có bài nào');

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    await waitForCards();
    expect(router.state.location.search).toBe('');
    expect(
      screen.getByRole('searchbox', { name: 'Tìm theo tiêu đề' }),
    ).toHaveValue('');
    expect(lastQuery(api)).toEqual({ page: 1 });
    expect(cards()).toHaveLength(3);
  });

  it('ABG-04 chưa có bài nào và không bộ lọc ⇒ vẫn chữ A1 nhưng KHÔNG có nút "Xoá bộ lọc" (không có gì để xoá)', async () => {
    renderPublicPages({ api: createFakeArticleApi([]) });
    expect(
      await screen.findByText('Không tìm thấy bài viết phù hợp.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });

  it('ABG-04 chỉ có nháp và lưu trữ (không bài đã xuất bản) ⇒ rỗng: công khai không thấy bài chưa xuất bản', async () => {
    const api = createFakeArticleApi([
      makePublished({ baiVietId: '1', trangThai: 'BanNhap' }),
      makePublished({ baiVietId: '2', trangThai: 'LuuTruAn' }),
    ]);
    renderPublicPages({ api });
    expect(
      await screen.findByText('Không tìm thấy bài viết phù hợp.'),
    ).toBeInTheDocument();
  });

  it('ABG-04 "Xoá bộ lọc" cũng xoá chữ còn dở ở ô tìm (kể cả khi URL chưa có)', async () => {
    const api = createFakeArticleApi(makeManyPublished(2));
    renderPublicPages({ api, path: '/cam-nang?the=khong-co-the-nay' });
    await screen.findByText('Không tìm thấy bài viết phù hợp.');

    const box = screen.getByRole('searchbox', { name: 'Tìm theo tiêu đề' });
    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    await waitForCards();
    expect(box).toHaveValue('');
  });
});

describe('danh sách công khai: tiêu đề tab và mô tả (ABG-09)', () => {
  it('ABG-09 danh sách đặt "Cẩm nang sức khỏe | CLINIX" và meta description là phụ đề; rời trang thì trả lại', async () => {
    const api = createFakeArticleApi(makeManyPublished(2));
    const { unmount } = renderPublicPages({ api });
    await waitForCards();

    expect(document.title).toBe('Cẩm nang sức khỏe | CLINIX');
    expect(
      document.head
        .querySelector('meta[name="description"]')
        ?.getAttribute('content'),
    ).toBe('Kiến thức y tế hữu ích từ đội ngũ chuyên gia CLINIX');

    unmount();
    expect(document.title).toBe('CLINIX');
    expect(document.head.querySelector('meta[name="description"]')).toBeNull();
  });
});

describe('danh sách công khai: không phụ thuộc chi nhánh (ABG-12)', () => {
  function BranchControl() {
    const { select } = useSelectedBranch();
    return (
      <button onClick={() => select('2', 'NguoiDung')}>
        Chọn chi nhánh mẫu
      </button>
    );
  }

  it('ABG-12 đổi chi nhánh đang chọn ⇒ KHÔNG gọi lại danh sách bài (bài viết không có cột chi nhánh), cũng không gọi lại thẻ phổ biến', async () => {
    const api = createFakeArticleApi(makeManyPublished(3));
    renderPublicPages({ api, extra: <BranchControl /> });
    await waitForCards();
    expect(api.callsTo('listPublic')).toHaveLength(1);
    expect(api.callsTo('listPublicTags')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Chọn chi nhánh mẫu' }));
    await sleep(80);
    expect(api.callsTo('listPublic')).toHaveLength(1);
    expect(api.callsTo('listPublicTags')).toHaveLength(1);
    expect(cards()).toHaveLength(3);
  });
});
