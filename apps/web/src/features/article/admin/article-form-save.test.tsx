import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { makeDetail } from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { addTag, clickSave, field, fill } from '../testing/form-helpers';
import { renderArticlePages } from '../testing/render-article-pages';

// article F1, ABW-07 (bấm đúp "Lưu" một lời gọi) cùng luồng lưu: tạo mới ⇒ sang trang sửa kèm thông báo; sửa chỉ gửi ô đã đổi (PLAN 5.7, 2.4.55 b3 đến b5). Bản giả; dữ liệu giả.
const saveButton = () =>
  screen.getByRole('button', { name: /^(Lưu|Đang lưu…)$/ });
const statusText = () => screen.getByRole('status').textContent;

const editSetup = async (overrides = {}) => {
  const api = createFakeArticleApi([
    makeDetail({
      baiVietId: '1',
      tieuDe: 'Sốt xuất huyết',
      moTaNgan: 'Mô tả cũ',
      noiDung: 'Nội dung cũ',
      hashtag: ['a', 'b'],
      ...overrides,
    }),
  ]);
  const view = renderArticlePages({ api, path: '/admin/bai-viet/1' });
  await screen.findByRole('heading', { name: 'Sửa bài viết' });
  return { api, ...view };
};

describe('tạo bài mới (ABW-07)', () => {
  it('ABW-07 tạo thành công ⇒ MỘT lời gọi với thân đúng (có noiDung và hashtag, không có moTaNgan khi trống), chuyển sang trang sửa, hiện "Đã lưu bài viết." cạnh nút Lưu, không hộp "Rời khỏi trang?"', async () => {
    const api = createFakeArticleApi();
    const { router } = renderArticlePages({ api, path: '/admin/bai-viet/moi' });
    expect(screen.getByRole('heading', { name: 'Viết bài mới' })).toBeVisible();

    fill('Tiêu đề', '  Bài   mới ');
    addTag('Trẻ Em');
    clickSave();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/bai-viet/1'),
    );
    expect(api.callsTo('create').map((call) => call.args[0])).toEqual([
      {
        tieuDe: 'Bài mới',
        noiDung: '',
        hashtag: ['trẻ-em'],
        trangThai: 'BanNhap',
      },
    ]);
    expect(
      await screen.findByRole('heading', { name: 'Sửa bài viết' }),
    ).toBeVisible();
    expect(await screen.findByText('Đã lưu bài viết.')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu bài viết.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(field('Tiêu đề')).toHaveValue('Bài mới');
    expect(screen.getByRole('button', { name: 'Bỏ thẻ trẻ-em' })).toBeVisible();
  });

  it('ABW-07 tạo bài đã xuất bản ngay: thân có trangThai DaXuatBan và mô tả đã trim', async () => {
    const api = createFakeArticleApi();
    renderArticlePages({ api, path: '/admin/bai-viet/moi' });

    fill('Tiêu đề', 'Bài xuất bản');
    fill('Mô tả ngắn', ' Mô tả ');
    fill('Nội dung', 'Nội dung');
    fireEvent.change(field('Trạng thái'), { target: { value: 'DaXuatBan' } });
    clickSave();

    await waitFor(() => expect(api.callsTo('create')).toHaveLength(1));
    expect(api.callsTo('create')[0].args[0]).toEqual({
      tieuDe: 'Bài xuất bản',
      moTaNgan: 'Mô tả',
      noiDung: 'Nội dung',
      hashtag: [],
      trangThai: 'DaXuatBan',
    });
  });

  it('ABW-07 bấm đúp "Lưu" trong MỘT khung hình ⇒ đúng một lời gọi tạo (chốt đồng bộ, không chỉ nút bị khoá)', async () => {
    const api = createFakeArticleApi();
    renderArticlePages({ api, path: '/admin/bai-viet/moi' });
    fill('Tiêu đề', 'Bài bấm đúp');
    const button = saveButton();

    act(() => {
      button.click();
      button.click();
    });

    await screen.findByRole('heading', { name: 'Sửa bài viết' });
    expect(api.callsTo('create')).toHaveLength(1);
    expect(api.articles()).toHaveLength(1);
  });

  it('ABW-07 đang lưu: nút đổi chữ "Đang lưu…" và khoá; các ô bị khoá; xong thì mở lại', async () => {
    const api = createFakeArticleApi();
    const gate = api.hold('create');
    renderArticlePages({ api, path: '/admin/bai-viet/moi' });
    fill('Tiêu đề', 'Bài chờ');

    clickSave();

    await waitFor(() => expect(saveButton()).toHaveTextContent('Đang lưu…'));
    expect(saveButton()).toBeDisabled();
    expect(field('Tiêu đề')).toBeDisabled();
    await act(async () => gate.release());
    await screen.findByRole('heading', { name: 'Sửa bài viết' });
  });

  it('ABW-07 tạo mới chỉ có hai trạng thái Bản nháp và Đã xuất bản (không "Lưu trữ")', () => {
    renderArticlePages({
      api: createFakeArticleApi(),
      path: '/admin/bai-viet/moi',
    });

    const options = Array.from(
      (field('Trạng thái') as HTMLSelectElement).options,
      (option) => option.textContent,
    );
    expect(options).toEqual(['Bản nháp', 'Đã xuất bản']);
  });
});

describe('sửa bài (ABW-07, ABW-09)', () => {
  it('ABW-09 điền sẵn đúng các ô từ bài đang sửa', async () => {
    await editSetup({ trangThai: 'DaXuatBan' });

    expect(field('Tiêu đề')).toHaveValue('Sốt xuất huyết');
    expect(field('Mô tả ngắn')).toHaveValue('Mô tả cũ');
    expect(field('Nội dung')).toHaveValue('Nội dung cũ');
    expect(field('Trạng thái')).toHaveValue('DaXuatBan');
    expect(screen.getByRole('button', { name: 'Bỏ thẻ a' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Bỏ thẻ b' })).toBeVisible();
    expect(screen.getByText('11 / 20.000')).toBeVisible();
    expect(
      Array.from(
        (field('Trạng thái') as HTMLSelectElement).options,
        (option) => option.textContent,
      ),
    ).toEqual(['Bản nháp', 'Đã xuất bản', 'Lưu trữ']);
    expect(statusText()).toBe('Chưa có thay đổi nào.');
  });

  it('ABW-07 sửa tiêu đề rồi Lưu ⇒ PATCH CHỈ gửi tiêu đề; thông báo thành công cạnh nút; sửa tiếp thì thông báo biến mất và hiện "Có thay đổi chưa lưu."', async () => {
    const { api } = await editSetup();

    fill('Tiêu đề', '  Sốt   xuất huyết Dengue ');
    expect(statusText()).toBe('Có thay đổi chưa lưu.');
    clickSave();

    expect(await screen.findByText('Đã lưu bài viết.')).toBeVisible();
    expect(api.callsTo('update').map((call) => call.args)).toEqual([
      ['1', { tieuDe: 'Sốt xuất huyết Dengue' }],
    ]);
    expect(field('Tiêu đề')).toHaveValue('Sốt xuất huyết Dengue');

    fill('Nội dung', 'Nội dung mới');
    expect(screen.queryByText('Đã lưu bài viết.')).toBeNull();
    expect(statusText()).toBe('Có thay đổi chưa lưu.');
  });

  it('ABW-07 xoá mô tả ⇒ gửi moTaNgan "" ; thay thẻ ⇒ gửi cả mảng thẻ mới', async () => {
    const { api } = await editSetup();

    fill('Mô tả ngắn', '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ thẻ a' }));
    addTag('c');
    clickSave();

    await screen.findByText('Đã lưu bài viết.');
    expect(api.callsTo('update')[0].args[1]).toEqual({
      moTaNgan: '',
      hashtag: ['b', 'c'],
    });
    expect(api.articles()[0].moTaNgan).toBeNull();
  });

  it('ABW-07 đổi thứ tự thẻ hay chữ cuối dòng không phải thay đổi: bấm Lưu báo "Không có thay đổi nào để lưu." và KHÔNG gọi API', async () => {
    const { api } = await editSetup();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ thẻ a' }));
    addTag('a');
    fill('Tiêu đề', 'Sốt xuất huyết  ');
    expect(statusText()).toBe('Chưa có thay đổi nào.');
    clickSave();

    expect(
      await screen.findByText('Không có thay đổi nào để lưu.'),
    ).toBeVisible();
    expect(api.callsTo('update')).toHaveLength(0);
  });

  it('ABW-07 bấm đúp "Lưu" khi sửa ⇒ đúng một lời gọi PATCH', async () => {
    const { api } = await editSetup();
    fill('Tiêu đề', 'Tên mới');
    const button = saveButton();

    act(() => {
      button.click();
      button.click();
    });

    await screen.findByText('Đã lưu bài viết.');
    expect(api.callsTo('update')).toHaveLength(1);
  });

  it('ABW-07 sau khi lưu xong, lưu lại không đổi gì thì không gọi lại (mốc so sánh lấy từ bản máy chủ)', async () => {
    const { api } = await editSetup();
    fill('Tiêu đề', 'Tên mới');
    clickSave();
    await screen.findByText('Đã lưu bài viết.');

    clickSave();

    expect(
      await screen.findByText('Không có thay đổi nào để lưu.'),
    ).toBeVisible();
    expect(api.callsTo('update')).toHaveLength(1);
  });
});
