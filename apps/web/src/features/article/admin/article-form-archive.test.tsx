import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { makeDetail } from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { chooseStatus, clickSave } from '../testing/form-helpers';
import { renderArticlePages } from '../testing/render-article-pages';

// article F1, ABW-06 (A2) ở BIỂU MẪU: chọn Trạng thái = Lưu trữ cho bài ĐANG xuất bản rồi Lưu ⇒ hộp cảnh báo, xác nhận mới gọi API. Bản giả; dữ liệu giả.
const open = async (trangThai: 'BanNhap' | 'DaXuatBan' | 'LuuTruAn') => {
  const api = createFakeArticleApi([
    makeDetail({
      baiVietId: '1',
      tieuDe: 'Bài thử',
      noiDung: 'Nội dung',
      trangThai,
    }),
  ]);
  renderArticlePages({ api, path: '/admin/bai-viet/1' });
  await screen.findByRole('heading', { name: 'Sửa bài viết' });
  return api;
};

describe('biểu mẫu: ẩn bài đang xuất bản (ABW-06)', () => {
  it('ABW-06 bài DaXuatBan chọn "Lưu trữ" rồi Lưu ⇒ hộp "Lưu trữ bài viết?" đúng chữ, CHƯA gọi API', async () => {
    const api = await open('DaXuatBan');

    chooseStatus('LuuTruAn');
    clickSave();

    const box = await screen.findByRole('dialog', {
      name: 'Lưu trữ bài viết?',
    });
    expect(box).toHaveTextContent(
      'Bài viết sẽ không còn hiển thị công khai, kể cả trong tra cứu. Lượt Thích và Không thích vẫn được giữ.',
    );
    expect(api.callsTo('update')).toHaveLength(0);
  });

  it('ABW-06 "Huỷ" đóng hộp, giữ nguyên lựa chọn và không gọi API; Esc cũng vậy', async () => {
    const api = await open('DaXuatBan');
    chooseStatus('LuuTruAn');
    clickSave();
    await screen.findByRole('dialog');

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Huỷ' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Trạng thái')).toHaveValue('LuuTruAn');

    clickSave();
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.callsTo('update')).toHaveLength(0);
  });

  it('ABW-06 xác nhận ⇒ đúng một PATCH {trangThai:"LuuTruAn"}, hộp đóng, thông báo "Đã lưu bài viết."', async () => {
    const api = await open('DaXuatBan');
    chooseStatus('LuuTruAn');
    clickSave();

    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Lưu trữ',
      }),
    );

    expect(await screen.findByText('Đã lưu bài viết.')).toBeVisible();
    expect(api.callsTo('update').map((call) => call.args)).toEqual([
      ['1', { trangThai: 'LuuTruAn' }],
    ]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.articles()[0].trangThai).toBe('LuuTruAn');
  });

  it('ABW-06 bài BanNhap chọn "Lưu trữ" KHÔNG hỏi (chỉ bài đang xuất bản mới có A2)', async () => {
    const api = await open('BanNhap');

    chooseStatus('LuuTruAn');
    clickSave();

    await waitFor(() => expect(api.callsTo('update')).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ABW-06 bài DaXuatBan đổi sang Bản nháp KHÔNG hỏi', async () => {
    const api = await open('DaXuatBan');

    chooseStatus('BanNhap');
    clickSave();

    await waitFor(() => expect(api.callsTo('update')).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.callsTo('update')[0].args[1]).toEqual({ trangThai: 'BanNhap' });
  });

  it('ABW-06 bài DaXuatBan vừa sửa tiêu đề vừa chọn Lưu trữ: hộp hiện trước, xác nhận gửi cả hai thay đổi trong MỘT lời gọi', async () => {
    const api = await open('DaXuatBan');
    fireEvent.change(screen.getByLabelText('Tiêu đề'), {
      target: { value: 'Tên mới' },
    });

    chooseStatus('LuuTruAn');
    clickSave();
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Lưu trữ',
      }),
    );

    await screen.findByText('Đã lưu bài viết.');
    expect(api.callsTo('update').map((call) => call.args)).toEqual([
      ['1', { tieuDe: 'Tên mới', trangThai: 'LuuTruAn' }],
    ]);
  });
});
