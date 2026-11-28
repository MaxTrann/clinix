import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { makeSeed } from '../testing/article-seed';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { addTag, clickSave, field, fill } from '../testing/form-helpers';
import { renderArticlePages } from '../testing/render-article-pages';

// article F1, ABW-11: bàn phím và focus (hộp xác nhận, chip thẻ, gợi ý) và 375 px. 375 px chỉ kiểm bằng LỚP và CẤU TRÚC (css:false không có cascade thật, vitest không đo bố cục):
// đo điểm ảnh ở 125 phần trăm và 375 px là việc của X1 (kiểm tay). Bản giả; dữ liệu giả.
const ARCHIVE = 'Lưu trữ (ẩn bài) bài viết Sốt xuất huyết';

const openList = async () => {
  const api = createFakeArticleApi(makeSeed());
  const view = renderArticlePages({ api });
  await screen.findByRole('table', { name: 'Danh sách bài viết' });
  return { api, ...view };
};

describe('hộp xác nhận ẩn bài: bàn phím và focus (ABW-11)', () => {
  it('ABW-11 mở hộp ⇒ focus vào hộp; Tab đi vòng trong hộp (không thoát ra trang), Shift+Tab ngược lại', async () => {
    await openList();
    const opener = screen.getByRole('button', { name: ARCHIVE });
    opener.focus();
    fireEvent.click(opener);

    const box = screen.getByRole('dialog');
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute('aria-modal', 'true');
    const cancel = within(box).getByRole('button', { name: 'Huỷ' });
    const confirm = within(box).getByRole('button', { name: 'Lưu trữ' });

    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it('ABW-11 Esc đóng hộp và trả focus về nút đã mở', async () => {
    await openList();
    const opener = screen.getByRole('button', { name: ARCHIVE });
    opener.focus();
    fireEvent.click(opener);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('ABW-11 hộp "Rời khỏi trang?" của biểu mẫu cũng nhận focus, Esc đóng và giữ nguyên trang', async () => {
    const api = createFakeArticleApi(makeSeed());
    const { router } = renderArticlePages({ api, path: '/admin/bai-viet/1' });
    await screen.findByRole('heading', { name: 'Sửa bài viết' });
    fill('Tiêu đề', 'Sửa dở');

    fireEvent.click(screen.getByRole('link', { name: 'Quay lại danh sách' }));

    const box = await screen.findByRole('dialog', { name: 'Rời khỏi trang?' });
    expect(box).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/admin/bai-viet/1');
  });
});

describe('ô thẻ: bàn phím và đọc màn hình (ABW-11)', () => {
  const setup = () => {
    const api = createFakeArticleApi(makeSeed());
    renderArticlePages({ api, path: '/admin/bai-viet/moi' });
    return api;
  };

  it('ABW-11 ô thẻ là combobox có tên "Thẻ"; nút bỏ chip có tên riêng từng thẻ và là nút bấm được bằng bàn phím (button)', () => {
    setup();
    addTag('Trẻ Em');
    addTag('Sốt');

    expect(screen.getByRole('combobox', { name: 'Thẻ' })).toHaveAttribute(
      'aria-autocomplete',
      'list',
    );
    const remove = screen.getAllByRole('button', { name: /^Bỏ thẻ / });
    expect(remove.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Bỏ thẻ trẻ-em',
      'Bỏ thẻ sốt',
    ]);
    for (const button of remove)
      expect(button).toHaveAttribute('type', 'button');
  });

  it('ABW-11 bỏ chip xong focus về ô nhập (không rơi về <body>)', () => {
    setup();
    addTag('a');

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ thẻ a' }));

    expect(field('Thẻ')).toHaveFocus();
  });

  it('ABW-11 gợi ý: aria-expanded, aria-controls trỏ đúng listbox, mũi tên đổi aria-activedescendant', async () => {
    setup();
    const input = field('Thẻ');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 's' } });
    const list = await screen.findByRole('listbox', { name: 'Gợi ý thẻ' });

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', list.id);
    expect(input).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const [first] = within(list).getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', first.id);
  });
});

describe('375 px: lớp và cấu trúc, vùng bấm 44 px (ABW-11)', () => {
  it('ABW-11 danh sách: chip lọc xuống dòng (flex-wrap) và cao tối thiểu 44 px; nút từng dòng cao tối thiểu 44 px; ô lọc rộng hết khung', async () => {
    await openList();

    const group = screen.getByRole('group', { name: 'Lọc theo trạng thái' });
    expect(group).toHaveClass('flex-wrap');
    for (const chip of within(group).getAllByRole('button')) {
      expect(chip).toHaveClass('min-h-[44px]');
    }
    const row = screen
      .getAllByRole('row')
      .find((item) => item.textContent?.includes('Sốt xuất huyết'))!;
    for (const control of [
      within(row).getByRole('link', { name: 'Sửa bài viết Sốt xuất huyết' }),
      within(row).getByRole('button', { name: ARCHIVE }),
    ]) {
      expect(control).toHaveClass('min-h-[44px]');
      expect(control).toHaveClass('min-w-[44px]');
    }
    expect(
      screen.getByRole('searchbox', { name: 'Tìm theo tiêu đề' }),
    ).toHaveClass('w-full');
    expect(screen.getByLabelText('Lọc theo thẻ')).toHaveClass('w-full');
    expect(screen.getByRole('link', { name: 'Viết bài mới' })).toHaveClass(
      'min-h-[44px]',
    );
  });

  it('ABW-11 biểu mẫu: mọi ô rộng hết khung (w-full, min-w-0); thanh Lưu xếp dọc dưới sm; nút Lưu và Xem trước cao tối thiểu 44 px', async () => {
    renderArticlePages({
      api: createFakeArticleApi(),
      path: '/admin/bai-viet/moi',
    });

    for (const label of [
      'Tiêu đề',
      'Mô tả ngắn',
      'Nội dung',
      'Thẻ',
      'Trạng thái',
    ]) {
      expect(field(label)).toHaveClass('w-full');
    }
    const save = screen.getByRole('button', { name: 'Lưu' });
    const bar = save.closest('.sticky') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar).toHaveClass('flex-col');
    expect(bar).toHaveClass('sm:flex-row');
    for (const button of [
      save,
      screen.getByRole('button', { name: 'Xem trước' }),
    ]) {
      expect(button).toHaveClass('min-h-[44px]');
      expect(button).toHaveClass('min-w-[44px]');
    }
    expect(save.closest('section')).toHaveClass('min-w-0');
  });

  it('ABW-11 chip thẻ và nút bỏ chip: chip xuống dòng, nút bỏ cao tối thiểu 44 px, tên thẻ dài tự ngắt', () => {
    renderArticlePages({
      api: createFakeArticleApi(),
      path: '/admin/bai-viet/moi',
    });
    addTag('a'.repeat(50));

    const remove = screen.getByRole('button', {
      name: `Bỏ thẻ ${'a'.repeat(50)}`,
    });
    expect(remove).toHaveClass('min-h-[44px]');
    expect(remove).toHaveClass('min-w-[44px]');
    expect(remove.closest('ul')).toHaveClass('flex-wrap');
    expect(screen.getByText(`#${'a'.repeat(50)}`)).toHaveClass('break-all');
  });

  it('ABW-11 lỗi theo ô không làm tràn: câu lỗi nằm trong cột của ô, focus vào ô lỗi khi lưu thiếu tiêu đề', async () => {
    renderArticlePages({
      api: createFakeArticleApi(),
      path: '/admin/bai-viet/moi',
    });

    clickSave();

    await waitFor(() => expect(field('Tiêu đề')).toHaveFocus());
    const message = screen.getByText(
      'Tiêu đề không được để trống và tối đa 255 ký tự.',
    );
    expect(message.parentElement).toContainElement(field('Tiêu đề'));
  });
});
