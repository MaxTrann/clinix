import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { makeDetail } from '../testing/article-fixtures';
import { makeSeed } from '../testing/article-seed';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { addTag, clickSave, field, fill } from '../testing/form-helpers';
import { renderArticlePages } from '../testing/render-article-pages';

// article F1, ABW-09: đóng (rời trang) khi còn thay đổi chưa lưu thì hỏi; không có thay đổi thì đi thẳng. Dùng `useBlocker` của router dữ liệu (nếp trang Cài đặt hệ thống). Bản giả; dữ liệu giả.
const backLink = () => screen.getByRole('link', { name: 'Quay lại danh sách' });
const leaveDialog = () =>
  screen.queryByRole('dialog', { name: 'Rời khỏi trang?' });

const editSetup = async () => {
  const api = createFakeArticleApi(makeSeed());
  const view = renderArticlePages({ api, path: '/admin/bai-viet/1' });
  await screen.findByRole('heading', { name: 'Sửa bài viết' });
  return { api, ...view };
};

describe('rời biểu mẫu khi có thay đổi chưa lưu (ABW-09)', () => {
  it('ABW-09 KHÔNG có thay đổi ⇒ "Quay lại danh sách" đi thẳng, không hỏi', async () => {
    const { router } = await editSetup();

    fireEvent.click(backLink());

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/bai-viet'),
    );
    expect(leaveDialog()).toBeNull();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bài viết' }),
    ).toBeVisible();
  });

  it('ABW-09 có thay đổi ⇒ hộp "Rời khỏi trang?" đúng chữ; "Ở lại" giữ nguyên trang và chữ đã nhập', async () => {
    const { router } = await editSetup();
    fill('Nội dung', 'Đang viết dở');

    fireEvent.click(backLink());

    const box = await screen.findByRole('dialog', { name: 'Rời khỏi trang?' });
    expect(box).toHaveTextContent('Các thay đổi chưa lưu sẽ bị mất.');
    expect(
      within(box).getByRole('button', { name: 'Rời khỏi trang' }),
    ).toBeVisible();
    fireEvent.click(within(box).getByRole('button', { name: 'Ở lại' }));
    expect(leaveDialog()).toBeNull();
    expect(router.state.location.pathname).toBe('/admin/bai-viet/1');
    expect(field('Nội dung')).toHaveValue('Đang viết dở');
  });

  it('ABW-09 "Rời khỏi trang" đi tiếp tới danh sách, bỏ thay đổi', async () => {
    const { router, api } = await editSetup();
    fill('Tiêu đề', 'Sửa dở');

    fireEvent.click(backLink());
    fireEvent.click(
      within(
        await screen.findByRole('dialog', { name: 'Rời khỏi trang?' }),
      ).getByRole('button', { name: 'Rời khỏi trang' }),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/bai-viet'),
    );
    expect(api.callsTo('update')).toHaveLength(0);
    await screen.findByRole('table', { name: 'Danh sách bài viết' });
  });

  it('ABW-09 Esc ở hộp cũng là "Ở lại"', async () => {
    const { router } = await editSetup();
    fill('Mô tả ngắn', 'Sửa dở');
    fireEvent.click(backLink());
    await screen.findByRole('dialog', { name: 'Rời khỏi trang?' });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(leaveDialog()).toBeNull();
    expect(router.state.location.pathname).toBe('/admin/bai-viet/1');
  });

  it('ABW-09 sửa rồi sửa lại đúng như cũ thì không còn là "thay đổi chưa lưu"', async () => {
    const { router } = await editSetup();
    fill('Tiêu đề', 'Khác');
    fill('Tiêu đề', 'Sốt xuất huyết');

    fireEvent.click(backLink());

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/bai-viet'),
    );
    expect(leaveDialog()).toBeNull();
  });

  it('ABW-09 đã lưu xong thì rời trang không hỏi nữa', async () => {
    const { router } = await editSetup();
    fill('Tiêu đề', 'Tên mới');
    clickSave();
    await screen.findByText('Đã lưu bài viết.');

    fireEvent.click(backLink());

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/bai-viet'),
    );
    expect(leaveDialog()).toBeNull();
  });

  it('ABW-09 tạo mới: đã gõ gì đó thì hỏi; để trống thì đi thẳng', async () => {
    const api = createFakeArticleApi();
    const { router } = renderArticlePages({ api, path: '/admin/bai-viet/moi' });

    fireEvent.click(backLink());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/bai-viet'),
    );
    expect(leaveDialog()).toBeNull();

    await act(async () => {
      await router.navigate('/admin/bai-viet/moi');
    });
    addTag('moi');
    fireEvent.click(backLink());
    expect(
      await screen.findByRole('dialog', { name: 'Rời khỏi trang?' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/admin/bai-viet/moi');
  });

  it('ABW-09 đóng hay tải lại tab (beforeunload) chỉ bị chặn khi có thay đổi chưa lưu', async () => {
    await editSetup();
    const beforeUnload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(beforeUnload()).toBe(false);

    fill('Tiêu đề', 'Khác');
    expect(beforeUnload()).toBe(true);

    fill('Tiêu đề', 'Sốt xuất huyết');
    expect(beforeUnload()).toBe(false);
  });

  it('ABW-09 mở bài khác trong khi đang sửa dở cũng hỏi (đổi đường dẫn trong app)', async () => {
    const { router } = await editSetup();
    fill('Tiêu đề', 'Sửa dở');

    await act(async () => {
      void router.navigate('/admin/bai-viet/2');
    });

    expect(
      await screen.findByRole('dialog', { name: 'Rời khỏi trang?' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/admin/bai-viet/1');
  });
});

describe('trang sửa khi không tải được bài (ABW-05, ABW-09)', () => {
  it('ABW-05 mã sai dạng ⇒ "Không tìm thấy bài viết" và KHÔNG gọi API', () => {
    const api = createFakeArticleApi(makeSeed());
    renderArticlePages({ api, path: '/admin/bai-viet/abc' });

    expect(
      screen.getByRole('heading', { name: 'Không tìm thấy bài viết' }),
    ).toBeVisible();
    expect(
      screen.getByText('Bài viết không tồn tại hoặc đã bị gỡ.'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Quay lại danh sách' }),
    ).toHaveAttribute('href', '/admin/bai-viet');
    expect(api.callsTo('get')).toHaveLength(0);
  });

  it('ABW-05 bài không có (404 KHONG_TIM_THAY) ⇒ "Không tìm thấy bài viết"', async () => {
    const api = createFakeArticleApi([makeDetail({ baiVietId: '1' })]);
    renderArticlePages({ api, path: '/admin/bai-viet/99' });

    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy bài viết' }),
    ).toBeVisible();
    expect(api.callsTo('get')).toHaveLength(1);
  });
});
