import { screen, waitFor } from '@testing-library/react';
import { createFakeArticleApi } from '../testing/fake-article-api';
import {
  addTag,
  chooseStatus,
  clickSave,
  field,
  fill,
} from '../testing/form-helpers';
import { renderArticlePages } from '../testing/render-article-pages';

// article F1, ABW-03 (A1: thiếu tiêu đề, giữ nguyên nội dung đã nhập, focus vào ô lỗi) và ABW-10 (bộ đếm ký tự, chặn tại chỗ khi vượt). Bản giả; dữ liệu giả.
const TITLE_ERROR = 'Tiêu đề không được để trống và tối đa 255 ký tự.';
const CONTENT_TOO_LONG = 'Nội dung quá dài (tối đa 20.000 ký tự).';

const setup = () => {
  const api = createFakeArticleApi();
  const view = renderArticlePages({ api, path: '/admin/bai-viet/moi' });
  return { api, ...view };
};

describe('biểu mẫu: thiếu tiêu đề (ABW-03, A1)', () => {
  it('ABW-03 gửi thiếu tiêu đề ⇒ lỗi gắn dưới ô, GIỮ NGUYÊN mọi ô đã nhập, focus vào ô lỗi, không gọi API', async () => {
    const { api } = setup();
    fill('Mô tả ngắn', 'Mô tả đã nhập');
    fill('Nội dung', 'Nội dung đã nhập');
    addTag('Trẻ Em');
    chooseStatus('DaXuatBan');

    clickSave();

    expect(await screen.findByText(TITLE_ERROR)).toBeVisible();
    expect(field('Tiêu đề')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Tiêu đề')).toHaveAccessibleDescription(TITLE_ERROR);
    await waitFor(() => expect(field('Tiêu đề')).toHaveFocus());
    expect(field('Mô tả ngắn')).toHaveValue('Mô tả đã nhập');
    expect(field('Nội dung')).toHaveValue('Nội dung đã nhập');
    expect(field('Trạng thái')).toHaveValue('DaXuatBan');
    expect(screen.getByRole('button', { name: 'Bỏ thẻ trẻ-em' })).toBeVisible();
    expect(api.callsTo('create')).toHaveLength(0);
  });

  it('ABW-03 tiêu đề chỉ có khoảng trắng cũng là trống', async () => {
    const { api } = setup();
    fill('Tiêu đề', '   \t ');

    clickSave();

    expect(await screen.findByText(TITLE_ERROR)).toBeVisible();
    expect(api.callsTo('create')).toHaveLength(0);
  });

  it('ABW-03 nhập tiêu đề thì lỗi biến mất ngay; gửi lại (4c) gọi API đúng một lần với nội dung đã giữ', async () => {
    const { api } = setup();
    fill('Nội dung', 'Giữ lại');
    clickSave();
    await screen.findByText(TITLE_ERROR);

    fill('Tiêu đề', 'Bài mới');
    expect(screen.queryByText(TITLE_ERROR)).toBeNull();
    clickSave();

    await waitFor(() => expect(api.callsTo('create')).toHaveLength(1));
    expect(api.callsTo('create')[0].args[0]).toMatchObject({
      tieuDe: 'Bài mới',
      noiDung: 'Giữ lại',
    });
  });

  it('ABW-03 nhiều ô lỗi cùng lúc: focus vào ô lỗi ĐẦU TIÊN theo thứ tự trên trang', async () => {
    const { api } = setup();
    fill('Mô tả ngắn', 'a'.repeat(501));
    fill('Nội dung', 'b'.repeat(20_001));

    clickSave();

    await screen.findByText(TITLE_ERROR);
    expect(screen.getByText('Mô tả ngắn tối đa 500 ký tự.')).toBeVisible();
    expect(screen.getByText(CONTENT_TOO_LONG)).toBeVisible();
    await waitFor(() => expect(field('Tiêu đề')).toHaveFocus());
    expect(api.callsTo('create')).toHaveLength(0);
  });

  it('ABW-03 tiêu đề 255 ký tự nhận, 256 bị chặn tại chỗ', async () => {
    const { api } = setup();
    fill('Tiêu đề', 'a'.repeat(256));
    clickSave();
    expect(await screen.findByText(TITLE_ERROR)).toBeVisible();
    expect(api.callsTo('create')).toHaveLength(0);

    fill('Tiêu đề', 'a'.repeat(255));
    clickSave();
    await waitFor(() => expect(api.callsTo('create')).toHaveLength(1));
  });
});

describe('biểu mẫu: bộ đếm và giới hạn (ABW-10)', () => {
  it('ABW-10 hiện "0 / 20.000" và "0 / 500", đếm theo ký tự (emoji là 1) khi gõ', () => {
    setup();
    expect(screen.getByText('0 / 20.000')).toBeVisible();
    expect(screen.getByText('0 / 500')).toBeVisible();

    fill('Nội dung', 'Xin chào😀');
    fill('Mô tả ngắn', '  abc  ');

    expect(screen.getByText('9 / 20.000')).toBeVisible();
    // mô tả đếm sau khi bỏ khoảng trắng hai đầu (cùng cách máy chủ kiểm)
    expect(screen.getByText('3 / 500')).toBeVisible();
  });

  it('ABW-10 nội dung 20.000 ký tự nhận; 20.001 bị chặn tại chỗ kèm câu, bộ đếm đỏ, KHÔNG gọi API', async () => {
    const { api } = setup();
    fill('Tiêu đề', 'Bài dài');
    fill('Nội dung', 'a'.repeat(20_001));
    expect(screen.getByText('20.001 / 20.000')).toHaveClass(
      'text-danger-strong',
    );

    clickSave();

    expect(await screen.findByText(CONTENT_TOO_LONG)).toBeVisible();
    expect(field('Nội dung')).toHaveAttribute('aria-invalid', 'true');
    expect(api.callsTo('create')).toHaveLength(0);

    fill('Nội dung', 'a'.repeat(20_000));
    expect(screen.getByText('20.000 / 20.000')).not.toHaveClass(
      'text-danger-strong',
    );
    clickSave();
    await waitFor(() => expect(api.callsTo('create')).toHaveLength(1));
  });

  it('ABW-10 nội dung dưới 20.000 ký tự nhưng vượt 60.000 byte (16.000 emoji) cũng bị chặn, dùng chung câu', async () => {
    const { api } = setup();
    fill('Tiêu đề', 'Nhiều emoji');
    fill('Nội dung', '😀'.repeat(16_000));
    expect(screen.getByText('16.000 / 20.000')).toHaveClass(
      'text-danger-strong',
    );

    clickSave();

    expect(await screen.findByText(CONTENT_TOO_LONG)).toBeVisible();
    expect(api.callsTo('create')).toHaveLength(0);
  });

  it('ABW-10 mô tả 500 ký tự nhận; 501 bị chặn kèm câu "Mô tả ngắn tối đa 500 ký tự."', async () => {
    const { api } = setup();
    fill('Tiêu đề', 'Có mô tả');
    fill('Mô tả ngắn', 'a'.repeat(501));
    expect(screen.getByText('501 / 500')).toHaveClass('text-danger-strong');

    clickSave();
    expect(
      await screen.findByText('Mô tả ngắn tối đa 500 ký tự.'),
    ).toBeVisible();
    expect(api.callsTo('create')).toHaveLength(0);

    fill('Mô tả ngắn', 'a'.repeat(500));
    clickSave();
    await waitFor(() => expect(api.callsTo('create')).toHaveLength(1));
  });

  it('ABW-03 chọn "Đã xuất bản" mà nội dung trống ⇒ "Cần có nội dung trước khi xuất bản." gắn ô Nội dung, không gọi API', async () => {
    const { api } = setup();
    fill('Tiêu đề', 'Xuất bản trống');
    chooseStatus('DaXuatBan');

    clickSave();

    expect(
      await screen.findByText('Cần có nội dung trước khi xuất bản.'),
    ).toBeVisible();
    expect(field('Nội dung')).toHaveAttribute('aria-invalid', 'true');
    expect(api.callsTo('create')).toHaveLength(0);
  });
});
