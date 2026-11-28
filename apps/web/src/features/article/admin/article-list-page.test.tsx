import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { errorMessageFor } from '../../../shared/api/error-message';
import { ApiError, NetworkError } from '../../../shared/api/errors';
import type { ArticleListQuery } from '../api/article-types';
import { makeMany, makeSeed } from '../testing/article-seed';
import {
  createFakeArticleApi,
  type FakeArticleApi,
} from '../testing/fake-article-api';
import { renderArticlePages } from '../testing/render-article-pages';

// article F1, ABW-02: danh sách quản trị (tải, lỗi và "Thử lại", rỗng, mất mạng, chip từ demTheoTrangThai, tìm, phân trang, bộ lọc ở URL). Bản giả `createFakeArticleApi`; dữ liệu giả.
const table = () => screen.findByRole('table', { name: 'Danh sách bài viết' });
const bodyRows = () =>
  within(screen.getByRole('table', { name: 'Danh sách bài viết' }))
    .getAllByRole('row')
    .slice(1);
const titles = () =>
  bodyRows().map((row) => within(row).getAllByRole('cell')[0].textContent);
const chips = () =>
  within(screen.getByRole('group', { name: 'Lọc theo trạng thái' }))
    .getAllByRole('button')
    .map((chip) => chip.textContent);
const lastQuery = (api: FakeArticleApi) =>
  api.callsTo('list').at(-1)!.args[0] as ArticleListQuery;
const searchBox = () =>
  screen.getByRole('searchbox', { name: 'Tìm theo tiêu đề' });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('danh sách bài viết: trạng thái tải (ABW-02)', () => {
  it('ABW-02 đang tải ⇒ "Đang tải danh sách bài viết…", rồi bảng đủ cột, đúng thứ tự cập nhật gần nhất, chip có số từ demTheoTrangThai', async () => {
    const api = createFakeArticleApi(makeSeed());
    const gate = api.hold('list');
    renderArticlePages({ api });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải danh sách bài viết…',
    );
    expect(screen.queryByRole('table')).toBeNull();
    await act(async () => gate.release());

    const grid = await table();
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Tiêu đề',
      'Trạng thái',
      'Thẻ',
      'Ngày xuất bản',
      'Cập nhật',
      'Thao tác',
    ]);
    expect(titles().map((text) => text?.split('Tác giả')[0])).toEqual([
      'Tiểu đường',
      'Sốt xuất huyết',
      'Tim mạch',
    ]);
    expect(chips()).toEqual([
      'Tất cả (3)',
      'Bản nháp (1)',
      'Đã xuất bản (1)',
      'Lưu trữ (1)',
    ]);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Bài viết' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Viết bài mới' })).toHaveAttribute(
      'href',
      '/admin/bai-viet/moi',
    );
  });

  it('ABW-02 nội dung một dòng: tác giả, trạng thái, thẻ, ngày xuất bản và cập nhật theo giờ Việt Nam, nút Sửa trỏ đúng bài', async () => {
    renderArticlePages({ api: createFakeArticleApi(makeSeed()) });
    await table();
    const published = bodyRows()[1];

    expect(
      within(published).getByText('Tác giả: Quản trị viên mẫu'),
    ).toBeVisible();
    expect(within(published).getByText('Đã xuất bản')).toBeVisible();
    expect(within(published).getByText('#sốt')).toBeVisible();
    expect(within(published).getByText('#trẻ-em')).toBeVisible();
    expect(within(published).getByText('20/11/2026')).toBeVisible();
    expect(within(published).getByText('21/11/2026')).toBeVisible();
    expect(
      within(published).getByRole('link', {
        name: 'Sửa bài viết Sốt xuất huyết',
      }),
    ).toHaveAttribute('href', '/admin/bai-viet/1');
    // bài nháp: chưa có ngày xuất bản
    expect(within(bodyRows()[0]).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('ABW-02 lỗi 500 ⇒ ErrorState kèm "Thử lại", chip không kèm số; "Thử lại" gọi lại ĐÚNG query và hiện bảng', async () => {
    const api = createFakeArticleApi(makeSeed());
    api.failNext(
      'list',
      new ApiError(500, { maLoi: 'LOI_HE_THONG', thongBao: 'câu của API' }),
    );
    renderArticlePages({ api });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Thử lại');
    expect(screen.queryByRole('table')).toBeNull();
    expect(chips()).toEqual(['Tất cả', 'Bản nháp', 'Đã xuất bản', 'Lưu trữ']);
    const first = lastQuery(api);

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await table();
    expect(api.callsTo('list')).toHaveLength(2);
    expect(lastQuery(api)).toEqual(first);
    expect(chips()[0]).toBe('Tất cả (3)');
  });

  it('ABW-02 mất mạng ⇒ câu mất kết nối, không bảng dở dang', async () => {
    const api = createFakeArticleApi(makeSeed());
    api.failNext('list', new NetworkError());
    renderArticlePages({ api });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      errorMessageFor(new NetworkError()),
    );
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('ABW-02 chưa có bài nào ⇒ "Chưa có bài viết nào."; đang lọc mà không khớp ⇒ "Không tìm thấy bài viết phù hợp."', async () => {
    const { unmount } = renderArticlePages({ api: createFakeArticleApi() });
    await table();
    expect(screen.getByText('Chưa có bài viết nào.')).toBeVisible();
    expect(chips()).toEqual([
      'Tất cả (0)',
      'Bản nháp (0)',
      'Đã xuất bản (0)',
      'Lưu trữ (0)',
    ]);
    unmount();

    renderArticlePages({
      api: createFakeArticleApi(makeSeed()),
      path: '/admin/bai-viet?q=khongcobaivietnaochonhuthe',
    });
    await table();
    expect(screen.getByText('Không tìm thấy bài viết phù hợp.')).toBeVisible();
    expect(screen.queryByText('Chưa có bài viết nào.')).toBeNull();
  });
});

describe('danh sách bài viết: bộ lọc ở URL (ABW-02)', () => {
  it('ABW-02 bấm chip trạng thái ⇒ ghi trangThai lên URL, gọi API với trangThai, chip đang chọn có aria-pressed; số ở chip không đổi (đếm trừ trangThai)', async () => {
    const api = createFakeArticleApi(makeSeed());
    const { router } = renderArticlePages({ api });
    await table();
    expect(screen.getByRole('button', { name: 'Tất cả (3)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đã xuất bản (1)' }));
    await waitFor(() => expect(titles()).toHaveLength(1));

    expect(router.state.location.search).toBe('?trangThai=DaXuatBan');
    expect(lastQuery(api)).toMatchObject({ trangThai: 'DaXuatBan', page: 1 });
    expect(
      screen.getByRole('button', { name: 'Đã xuất bản (1)' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tất cả (3)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(chips()).toEqual([
      'Tất cả (3)',
      'Bản nháp (1)',
      'Đã xuất bản (1)',
      'Lưu trữ (1)',
    ]);
  });

  it('ABW-02 ô tìm: gõ không gọi ngay; sau 250 ms yên gọi MỘT lần với q đã trim và ghi q lên URL; gõ liên tiếp chỉ gọi một lần', async () => {
    const api = createFakeArticleApi(makeSeed());
    const { router } = renderArticlePages({ api });
    await table();

    fireEvent.change(searchBox(), { target: { value: '  Tiểu' } });
    fireEvent.change(searchBox(), { target: { value: '  Tiểu đường  ' } });
    expect(api.callsTo('list')).toHaveLength(1);

    await waitFor(() => expect(api.callsTo('list')).toHaveLength(2));
    expect(lastQuery(api).q).toBe('Tiểu đường');
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe(
      'Tiểu đường',
    );
    await waitFor(() => expect(titles()).toHaveLength(1));
    // không gọi thêm sau đó (chữ gõ còn khoảng trắng cuối nhưng cùng nghĩa với URL)
    await sleep(450);
    expect(api.callsTo('list')).toHaveLength(2);
    expect(searchBox()).toHaveValue('  Tiểu đường  ');
  });

  it('ABW-02 xoá hết chữ ở ô tìm ⇒ bỏ q khỏi URL và gọi lại không có q', async () => {
    const api = createFakeArticleApi(makeSeed());
    const { router } = renderArticlePages({
      api,
      path: '/admin/bai-viet?q=Tim',
    });
    await table();
    expect(searchBox()).toHaveValue('Tim');

    fireEvent.change(searchBox(), { target: { value: '' } });
    await waitFor(() => expect(api.callsTo('list')).toHaveLength(2));
    expect(lastQuery(api).q).toBeUndefined();
    expect(router.state.location.search).toBe('');
  });

  it('ABW-02 mở thẳng URL có đủ bốn khoá ⇒ gọi đúng và ô tìm, chip thẻ hiện đúng; tải lại (dựng lại router với cùng URL) giữ nguyên', async () => {
    const articles = makeMany(25).map((article) => ({
      ...article,
      hashtag: ['trẻ-em'],
    }));
    const path = `/admin/bai-viet?${new URLSearchParams({ q: 'Bài', trangThai: 'BanNhap', the: 'trẻ-em', trang: '2' })}`;
    const expected = { q: 'Bài', trangThai: 'BanNhap', the: 'trẻ-em', page: 2 };

    const api = createFakeArticleApi(articles);
    const first = renderArticlePages({ api, path });
    await table();
    expect(api.callsTo('list')[0].args[0]).toEqual(expected);
    expect(searchBox()).toHaveValue('Bài');
    expect(screen.getByRole('button', { name: 'Bỏ lọc thẻ' })).toBeVisible();
    expect(titles()).toHaveLength(5);
    first.unmount();

    const reloadApi = createFakeArticleApi(articles);
    renderArticlePages({ api: reloadApi, path });
    await table();
    expect(reloadApi.callsTo('list')[0].args[0]).toEqual(expected);
    expect(searchBox()).toHaveValue('Bài');
  });

  it('ABW-02 phân trang: "Trang sau" ⇒ trang 2 lên URL; đổi bộ lọc sau đó về trang 1 (URL bỏ trang)', async () => {
    const api = createFakeArticleApi(makeMany(25));
    const { router } = renderArticlePages({ api });
    await table();
    expect(titles()).toHaveLength(20);

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(titles()).toHaveLength(5));
    expect(lastQuery(api).page).toBe(2);
    expect(router.state.location.search).toBe('?trang=2');

    fireEvent.click(screen.getByRole('button', { name: 'Bản nháp (25)' }));
    await waitFor(() =>
      expect(lastQuery(api)).toMatchObject({ trangThai: 'BanNhap', page: 1 }),
    );
    expect(router.state.location.search).toBe('?trangThai=BanNhap');
  });

  it('ABW-02 trang vượt cuối (dữ liệu vừa ít đi) ⇒ tự chuyển về trang cuối, không hiện "rỗng" sai', async () => {
    const api = createFakeArticleApi(makeMany(25));
    const { router } = renderArticlePages({
      api,
      path: '/admin/bai-viet?trang=9',
    });

    await waitFor(() => expect(router.state.location.search).toBe('?trang=2'));
    await waitFor(() => expect(titles()).toHaveLength(5));
    expect(
      api
        .callsTo('list')
        .map((call) => (call.args[0] as ArticleListQuery).page),
    ).toEqual([9, 2]);
  });

  it('ABW-02 kết quả cũ KHÔNG đè kết quả mới: yêu cầu của bộ lọc trước về sau yêu cầu của bộ lọc sau', async () => {
    const api = createFakeArticleApi(makeSeed());
    renderArticlePages({ api });
    await table();

    const gate = api.hold('list');
    fireEvent.click(screen.getByRole('button', { name: 'Bản nháp (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu trữ (1)' }));
    await waitFor(() => expect(titles()).toHaveLength(1));
    expect(titles()[0]).toContain('Tim mạch');

    await act(async () => gate.release());
    await sleep(50);
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toContain('Tim mạch');
    expect(api.callsTo('list')).toHaveLength(3);
  });

  it('ABW-02 URL đổi từ ngoài (nút Quay lại) ⇒ ô tìm lấy lại giá trị của URL và gọi API đúng một lần cho giá trị đó', async () => {
    const api = createFakeArticleApi(makeSeed());
    const { router } = renderArticlePages({ api });
    await table();

    await act(async () => {
      await router.navigate('/admin/bai-viet?q=abc');
    });
    expect(searchBox()).toHaveValue('abc');
    await waitFor(() => expect(lastQuery(api).q).toBe('abc'));
    await sleep(350);
    expect(api.callsTo('list')).toHaveLength(2);
  });
});

describe('danh sách bài viết: lọc theo thẻ (ABW-02)', () => {
  const tagBox = () => screen.getByLabelText('Lọc theo thẻ');

  it('ABW-02 gõ tên thẻ rồi Enter ⇒ chuẩn hoá, ghi the lên URL, gọi API với the; "Bỏ lọc thẻ" bỏ lọc', async () => {
    const api = createFakeArticleApi(makeSeed());
    const { router } = renderArticlePages({ api });
    await table();

    fireEvent.change(tagBox(), { target: { value: '  #Trẻ Em ' } });
    expect(api.callsTo('list')).toHaveLength(1);
    fireEvent.keyDown(tagBox(), { key: 'Enter' });

    await waitFor(() => expect(titles()).toHaveLength(2));
    expect(lastQuery(api).the).toBe('trẻ-em');
    expect(router.state.location.search).toBe('?the=tr%E1%BA%BB-em');
    expect(tagBox()).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ lọc thẻ' }));
    await waitFor(() => expect(titles()).toHaveLength(3));
    expect(lastQuery(api).the).toBeUndefined();
    expect(router.state.location.search).toBe('');
  });

  it('ABW-02 tên thẻ sai ký tự ⇒ báo lỗi dưới ô, KHÔNG gọi API, gõ tiếp thì hết báo', async () => {
    const api = createFakeArticleApi(makeSeed());
    renderArticlePages({ api });
    await table();

    fireEvent.change(tagBox(), { target: { value: 'a!' } });
    fireEvent.keyDown(tagBox(), { key: 'Enter' });

    expect(
      screen.getByText(
        'Thẻ chỉ gồm chữ, số và dấu gạch ngang (tối đa 50 ký tự).',
      ),
    ).toBeVisible();
    expect(tagBox()).toHaveAttribute('aria-invalid', 'true');
    expect(api.callsTo('list')).toHaveLength(1);
    fireEvent.change(tagBox(), { target: { value: 'a' } });
    expect(screen.queryByText(/Thẻ chỉ gồm chữ/)).toBeNull();
  });

  it('ABW-02 Enter ở ô thẻ trống không làm gì', async () => {
    const api = createFakeArticleApi(makeSeed());
    renderArticlePages({ api });
    await table();

    fireEvent.keyDown(tagBox(), { key: 'Enter' });
    expect(api.callsTo('list')).toHaveLength(1);
  });
});
