import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { PublicArticleListQuery } from '../api/article-types';
import { makeManyPublished, makePublished } from '../testing/article-fixtures';
import {
  createFakeArticleApi,
  type FakeArticleApi,
} from '../testing/fake-article-api';
import { renderPublicPages } from '../testing/render-public-pages';

// article F2, ABG-03: bộ lọc ở URL là NGUỒN DUY NHẤT (tìm tiêu đề có debounce 250 ms, chip thẻ chọn một, chọn lại để bỏ, đổi bộ lọc về trang 1, tải lại và Quay lại, kết quả cũ không đè mới).
// Bản giả TỪ CHỐI `the` rỗng (như máy chủ thật) nên ca nào lỡ gửi `the=` sẽ đỏ.
const searchBox = () =>
  screen.getByRole('searchbox', { name: 'Tìm theo tiêu đề' });
const chipGroup = () => screen.findByRole('group', { name: 'Lọc theo thẻ' });
const chipNames = () =>
  within(screen.getByRole('group', { name: 'Lọc theo thẻ' }))
    .getAllByRole('button')
    .map((chip) => chip.textContent);
const chip = (name: string) =>
  within(screen.getByRole('group', { name: 'Lọc theo thẻ' })).getByRole(
    'button',
    { name },
  );
const titles = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);
const waitForCards = () => screen.findAllByRole('heading', { level: 2 });
const queries = (api: FakeArticleApi) =>
  api
    .callsTo('listPublic')
    .map((call) => call.args[0] as PublicArticleListQuery);
const lastQuery = (api: FakeArticleApi) => queries(api).at(-1)!;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const seed = () => [
  makePublished({
    baiVietId: '1',
    tieuDe: 'Sốt xuất huyết',
    hashtag: ['sốt', 'trẻ-em'],
    thoiDiemXuatBan: '2026-11-22T03:00:00.000Z',
  }),
  makePublished({
    baiVietId: '2',
    tieuDe: 'Tiểu đường',
    hashtag: ['trẻ-em'],
    thoiDiemXuatBan: '2026-11-21T03:00:00.000Z',
  }),
  makePublished({
    baiVietId: '3',
    tieuDe: 'Tim mạch',
    hashtag: [],
    thoiDiemXuatBan: '2026-11-20T03:00:00.000Z',
  }),
];
// 25 bài cùng gắn thẻ `chung` để dựng ba trang
const manyWithTag = () =>
  makeManyPublished(25).map((article) => ({ ...article, hashtag: ['chung'] }));

describe('bộ lọc ở URL: tìm tiêu đề (ABG-03)', () => {
  it('ABG-03 gõ không gọi ngay; sau 250 ms yên gọi MỘT lần với q đã trim và ghi q lên URL; gõ liên tiếp chỉ gọi một lần', async () => {
    const api = createFakeArticleApi(seed());
    const { router } = renderPublicPages({ api });
    await waitForCards();

    fireEvent.change(searchBox(), { target: { value: '  Tiểu' } });
    fireEvent.change(searchBox(), { target: { value: '  Tiểu đường  ' } });
    expect(api.callsTo('listPublic')).toHaveLength(1);

    await waitFor(() => expect(api.callsTo('listPublic')).toHaveLength(2));
    expect(lastQuery(api)).toEqual({ q: 'Tiểu đường', page: 1 });
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe(
      'Tiểu đường',
    );
    await waitFor(() => expect(titles()).toEqual(['Tiểu đường']));
    // Không gọi thêm sau đó (chữ gõ còn khoảng trắng cuối nhưng cùng nghĩa với URL)
    await sleep(450);
    expect(api.callsTo('listPublic')).toHaveLength(2);
    expect(searchBox()).toHaveValue('  Tiểu đường  ');
  });

  it('ABG-03 tìm không phân biệt hoa thường và dấu thanh (gõ "TIEU" ra "Tiểu đường"); `đ` khác `d` như máy chủ thật: "tieu duong" và "dau dau" KHÔNG ra "Tiểu đường" và "Đau đầu"', async () => {
    const api = createFakeArticleApi([
      ...seed(),
      makePublished({
        baiVietId: '4',
        tieuDe: 'Đau đầu',
        thoiDiemXuatBan: '2026-11-19T03:00:00.000Z',
      }),
    ]);
    renderPublicPages({ api });
    await waitForCards();

    fireEvent.change(searchBox(), { target: { value: 'TIEU' } });
    await waitFor(() => expect(titles()).toEqual(['Tiểu đường']));

    fireEvent.change(searchBox(), { target: { value: 'tieu duong' } });
    expect(
      await screen.findByText('Không tìm thấy bài viết phù hợp.'),
    ).toBeInTheDocument();

    fireEvent.change(searchBox(), { target: { value: 'đau' } });
    await waitFor(() => expect(titles()).toEqual(['Đau đầu']));
    fireEvent.change(searchBox(), { target: { value: 'dau dau' } });
    expect(
      await screen.findByText('Không tìm thấy bài viết phù hợp.'),
    ).toBeInTheDocument();
  });

  it('ABG-03 xoá hết chữ ở ô tìm ⇒ bỏ q khỏi URL và gọi lại không có q', async () => {
    const api = createFakeArticleApi(seed());
    const { router } = renderPublicPages({ api, path: '/cam-nang?q=Tim' });
    await waitForCards();
    expect(searchBox()).toHaveValue('Tim');
    expect(titles()).toEqual(['Tim mạch']);

    fireEvent.change(searchBox(), { target: { value: '' } });
    await waitFor(() => expect(api.callsTo('listPublic')).toHaveLength(2));
    expect(lastQuery(api)).toEqual({ page: 1 });
    expect(router.state.location.search).toBe('');
    await waitFor(() => expect(titles()).toHaveLength(3));
  });

  it('ABG-03 biên: q dài hơn 100 ký tự bị cắt về 100 trước khi gửi (máy chủ trả 400 nếu dài hơn)', async () => {
    const api = createFakeArticleApi(seed());
    renderPublicPages({ api });
    await waitForCards();

    fireEvent.change(searchBox(), { target: { value: 'a'.repeat(150) } });
    await waitFor(() => expect(api.callsTo('listPublic')).toHaveLength(2));
    expect(lastQuery(api).q).toBe('a'.repeat(100));
    expect(
      await screen.findByText('Không tìm thấy bài viết phù hợp.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('bộ lọc ở URL: chip thẻ (ABG-03)', () => {
  it('ABG-03 chip lấy từ thẻ phổ biến (nhiều bài trước), chọn một ⇒ the lên URL và vào lời gọi; chọn lại ⇒ BỎ the (không gửi `the=` rỗng)', async () => {
    const api = createFakeArticleApi(seed());
    const { router } = renderPublicPages({ api });
    await waitForCards();
    await chipGroup();
    expect(chipNames()).toEqual(['#trẻ-em', '#sốt']);
    expect(chip('#trẻ-em')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip('#sốt'));
    await waitFor(() => expect(titles()).toEqual(['Sốt xuất huyết']));
    expect(lastQuery(api)).toEqual({ the: 'sốt', page: 1 });
    expect(router.state.location.search).toBe(
      `?the=${encodeURIComponent('sốt')}`,
    );
    expect(chip('#sốt')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('#trẻ-em')).toHaveAttribute('aria-pressed', 'false');

    // Chọn thẻ khác ⇒ chỉ MỘT thẻ đang chọn
    fireEvent.click(chip('#trẻ-em'));
    await waitFor(() => expect(titles()).toHaveLength(2));
    expect(chip('#sốt')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('#trẻ-em')).toHaveAttribute('aria-pressed', 'true');

    // Chọn lại thẻ đang chọn ⇒ bỏ lọc
    fireEvent.click(chip('#trẻ-em'));
    await waitFor(() => expect(titles()).toHaveLength(3));
    expect(router.state.location.search).toBe('');
    // KHÔNG lời gọi nào mang `the` rỗng (bản giả đã sẽ ném 400)
    for (const query of queries(api)) {
      expect(query.the === undefined || query.the !== '').toBe(true);
    }
    expect(lastQuery(api).the).toBeUndefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ABG-03 thẻ phổ biến chỉ tải MỘT lần, không tải lại khi đổi bộ lọc (chip không nhấp nháy)', async () => {
    const api = createFakeArticleApi(seed());
    renderPublicPages({ api });
    await waitForCards();
    await chipGroup();

    fireEvent.click(chip('#sốt'));
    await waitFor(() => expect(titles()).toHaveLength(1));
    fireEvent.change(searchBox(), { target: { value: 'Sốt' } });
    await waitFor(() => expect(api.callsTo('listPublic')).toHaveLength(3));
    expect(api.callsTo('listPublicTags')).toHaveLength(1);
  });

  it('ABG-03 mở URL có thẻ KHÔNG nằm trong thẻ phổ biến (bấm từ trang chi tiết) ⇒ vẫn có một chip đang chọn để bỏ lọc', async () => {
    const api = createFakeArticleApi(seed());
    const { router } = renderPublicPages({
      api,
      path: `/cam-nang?the=${encodeURIComponent('hiếm-gặp')}`,
    });
    await screen.findByText('Không tìm thấy bài viết phù hợp.');
    await chipGroup();

    expect(chipNames()[0]).toBe('#hiếm-gặp');
    expect(chip('#hiếm-gặp')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip('#hiếm-gặp'));
    await waitForCards();
    expect(router.state.location.search).toBe('');
    expect(chipNames()).not.toContain('#hiếm-gặp');
  });

  it('ABG-03 URL có thẻ sai dạng hay rỗng (`the=`, `the=a/b`) ⇒ bỏ lọc, KHÔNG gửi lên máy chủ (không 400)', async () => {
    for (const the of ['', 'a/b', '<x>']) {
      const api = createFakeArticleApi(seed());
      const view = renderPublicPages({
        api,
        path: `/cam-nang?the=${encodeURIComponent(the)}`,
      });
      await waitForCards();
      expect(lastQuery(api)).toEqual({ page: 1 });
      expect(screen.queryByRole('alert')).toBeNull();
      view.unmount();
    }
  });
});

describe('bộ lọc ở URL: đổi bộ lọc về trang 1, tải lại, Quay lại (ABG-03)', () => {
  it('ABG-03 đang ở trang 3: chọn chip ⇒ về trang 1 (URL bỏ trang); gõ tìm ⇒ về trang 1', async () => {
    const api = createFakeArticleApi(manyWithTag());
    const { router } = renderPublicPages({ api, path: '/cam-nang?trang=3' });
    await waitForCards();
    expect(lastQuery(api)).toEqual({ page: 3 });
    await chipGroup();

    fireEvent.click(chip('#chung'));
    await waitFor(() =>
      expect(lastQuery(api)).toEqual({ the: 'chung', page: 1 }),
    );
    expect(router.state.location.search).toBe('?the=chung');

    await act(async () => {
      await router.navigate('/cam-nang?trang=3');
    });
    await waitFor(() => expect(lastQuery(api)).toEqual({ page: 3 }));
    fireEvent.change(searchBox(), { target: { value: 'Bài 1' } });
    await waitFor(() =>
      expect(lastQuery(api)).toEqual({ q: 'Bài 1', page: 1 }),
    );
    expect(router.state.location.search).toBe('?q=B%C3%A0i+1');
  });

  it('ABG-03 đang ở trang 3: CHỈ gõ chữ tìm (không đụng chip) ⇒ sau 250 ms URL về trang 1 và lời gọi listPublic có page 1', async () => {
    const api = createFakeArticleApi(manyWithTag());
    const { router } = renderPublicPages({ api, path: '/cam-nang?trang=3' });
    await waitForCards();
    expect(lastQuery(api)).toEqual({ page: 3 });
    expect(router.state.location.search).toBe('?trang=3');

    fireEvent.change(searchBox(), { target: { value: 'Bài 1' } });
    // Chưa qua 250 ms: URL và lời gọi chưa đổi
    expect(api.callsTo('listPublic')).toHaveLength(1);
    expect(router.state.location.search).toBe('?trang=3');

    await waitFor(() =>
      expect(lastQuery(api)).toEqual({ q: 'Bài 1', page: 1 }),
    );
    expect(api.callsTo('listPublic')).toHaveLength(2);
    // URL chỉ còn q: khoá `trang` đã bị bỏ (trang 1 là mặc định)
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe(
      'Bài 1',
    );
    expect(new URLSearchParams(router.state.location.search).has('trang')).toBe(
      false,
    );
  });

  it('ABG-03 mở thẳng URL có đủ ba khoá ⇒ gọi đúng, ô tìm và chip điền sẵn; tải lại (dựng lại với cùng URL) giữ nguyên', async () => {
    const path = `/cam-nang?${new URLSearchParams({ q: 'Bài', the: 'chung', trang: '2' })}`;
    const expected = { q: 'Bài', the: 'chung', page: 2 };

    const api = createFakeArticleApi(manyWithTag());
    const first = renderPublicPages({ api, path });
    await waitForCards();
    expect(queries(api)[0]).toEqual(expected);
    expect(searchBox()).toHaveValue('Bài');
    await chipGroup();
    expect(chip('#chung')).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toHaveLength(9);
    first.unmount();

    const reloadApi = createFakeArticleApi(manyWithTag());
    renderPublicPages({ api: reloadApi, path });
    await waitForCards();
    expect(queries(reloadApi)[0]).toEqual(expected);
    expect(searchBox()).toHaveValue('Bài');
  });

  it('ABG-03 URL đổi từ ngoài (nút Quay lại) ⇒ ô tìm lấy lại giá trị của URL và gọi API đúng MỘT lần cho giá trị đó (không gọi thừa với giá trị cũ)', async () => {
    const api = createFakeArticleApi(seed());
    const { router } = renderPublicPages({ api });
    await waitForCards();

    await act(async () => {
      await router.navigate('/cam-nang?q=abc');
    });
    expect(searchBox()).toHaveValue('abc');
    await waitFor(() => expect(lastQuery(api)).toEqual({ q: 'abc', page: 1 }));
    await sleep(350);
    expect(api.callsTo('listPublic')).toHaveLength(2);
  });

  it('ABG-03 URL rác: `trang=abc`, `trang=0`, `q` toàn khoảng trắng ⇒ mặc định, không lỗi', async () => {
    const api = createFakeArticleApi(seed());
    renderPublicPages({ api, path: '/cam-nang?trang=abc&q=%20%20' });
    await waitForCards();
    expect(lastQuery(api)).toEqual({ page: 1 });
  });

  it('ABG-03 trang vượt cuối (dữ liệu vừa ít đi) ⇒ tự chuyển về trang cuối, không hiện "rỗng" sai', async () => {
    const api = createFakeArticleApi(makeManyPublished(20));
    const { router } = renderPublicPages({ api, path: '/cam-nang?trang=9' });

    await waitFor(() => expect(router.state.location.search).toBe('?trang=3'));
    await waitFor(() => expect(titles()).toHaveLength(2));
    expect(queries(api).map((query) => query.page)).toEqual([9, 3]);
    expect(screen.queryByText('Không tìm thấy bài viết phù hợp.')).toBeNull();
  });
});

describe('bộ lọc ở URL: kết quả cũ không đè kết quả mới (ABG-03)', () => {
  it('ABG-03 yêu cầu của bộ lọc TRƯỚC về sau yêu cầu của bộ lọc SAU ⇒ vẫn hiện kết quả của bộ lọc sau', async () => {
    const api = createFakeArticleApi(seed());
    renderPublicPages({ api });
    await waitForCards();
    await chipGroup();

    const gate = api.hold('listPublic');
    fireEvent.click(chip('#sốt'));
    fireEvent.click(chip('#trẻ-em'));
    await waitFor(() => expect(titles()).toHaveLength(2));
    expect(titles()).toEqual(['Sốt xuất huyết', 'Tiểu đường']);
    expect(chip('#trẻ-em')).toHaveAttribute('aria-pressed', 'true');

    // Yêu cầu `the=sốt` (chỉ một bài) về MUỘN: không được đè kết quả của `the=trẻ-em`
    await act(async () => gate.release());
    await sleep(60);
    expect(titles()).toEqual(['Sốt xuất huyết', 'Tiểu đường']);
    expect(api.callsTo('listPublic')).toHaveLength(3);
  });

  it('ABG-03 đổi bộ lọc khi yêu cầu cũ chưa về ⇒ trạng thái "đang tải" của bộ lọc mới, không hiện danh sách của bộ lọc cũ', async () => {
    const api = createFakeArticleApi(seed());
    renderPublicPages({ api });
    await waitForCards();
    await chipGroup();

    const gate = api.hold('listPublic');
    fireEvent.click(chip('#sốt'));
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải bài viết…');
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    await act(async () => gate.release());
    await waitFor(() => expect(titles()).toEqual(['Sốt xuất huyết']));
  });
});
