import { fireEvent, screen } from '@testing-library/react';
import { ArticleContent } from '../common/article-content';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { addTag, field, fill } from '../testing/form-helpers';
import { renderArticlePages } from '../testing/render-article-pages';

// Bọc `ArticleContent` bằng một hàm theo dõi nhưng vẫn dựng thật: để chứng minh "Xem trước" dùng ĐÚNG component dựng nội dung của trang công khai
vi.mock('../common/article-content', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../common/article-content')>();
  return { ArticleContent: vi.fn(actual.ArticleContent) };
});

// article F1, ABW-08 (xem trước nội dung độc hại hiện thành chữ, dùng đúng component công khai) và một phần ABN-10 (trang xem trước chỉ có một h1). Bản giả; dữ liệu giả.
const HOSTILE =
  '## <img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n- [bấm](javascript:alert(1))\n- &lt;b&gt;đậm&lt;/b&gt;';

const previewButton = () =>
  screen.getByRole('button', { name: /^(Xem trước|Ẩn xem trước)$/ });
const region = () => screen.getByRole('region', { name: 'Xem trước bài viết' });

const setup = () => {
  const api = createFakeArticleApi();
  renderArticlePages({ api, path: '/admin/bai-viet/moi' });
  return api;
};

describe('xem trước (ABW-08)', () => {
  beforeEach(() => {
    vi.mocked(ArticleContent).mockClear();
  });

  it('ABW-08 mặc định ẩn; bấm "Xem trước" hiện khung, nút đổi thành "Ẩn xem trước" (aria-expanded); bấm lại thì ẩn', () => {
    setup();
    expect(
      screen.queryByRole('region', { name: 'Xem trước bài viết' }),
    ).toBeNull();
    expect(previewButton()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(previewButton());
    expect(region()).toBeVisible();
    expect(previewButton()).toHaveTextContent('Ẩn xem trước');
    expect(previewButton()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(previewButton());
    expect(
      screen.queryByRole('region', { name: 'Xem trước bài viết' }),
    ).toBeNull();
  });

  it('ABW-08 nội dung có <script>, <img onerror>, [a](javascript:…), &lt; ⇒ hiện THÀNH CHỮ trong khung xem trước', () => {
    setup();
    fill('Nội dung', HOSTILE);

    fireEvent.click(previewButton());

    const frame = region();
    expect(frame.querySelector('script, img, a')).toBeNull();
    expect(frame.querySelector('b')).toBeNull();
    expect(frame.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(frame.textContent).toContain('<script>alert(1)</script>');
    expect(frame.textContent).toContain('[bấm](javascript:alert(1))');
    expect(frame.textContent).toContain('&lt;b&gt;đậm&lt;/b&gt;');
    // "## " ở đầu dòng đơn thành tiêu đề phụ h2, "- " thành danh sách
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '<img src=x onerror=alert(1)>',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('ABW-08 dựng bằng ĐÚNG component ArticleContent của trang công khai, truyền đúng nội dung đang gõ', () => {
    setup();
    fill('Nội dung', 'Đoạn thử');

    fireEvent.click(previewButton());

    const calls = vi.mocked(ArticleContent).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)![0]).toEqual({ text: 'Đoạn thử' });
  });

  it('ABW-08 khung xem trước theo kịp chữ đang gõ: tiêu đề, mô tả, thẻ, nội dung', () => {
    setup();
    fireEvent.click(previewButton());
    expect(region()).toHaveTextContent('Chưa có nội dung để xem trước.');

    fill('Tiêu đề', 'Tiêu đề đang gõ');
    fill('Mô tả ngắn', 'Mô tả đang gõ');
    fill('Nội dung', 'Nội dung đang gõ');
    addTag('Trẻ Em');

    const frame = region();
    expect(frame).toHaveTextContent('Tiêu đề đang gõ');
    expect(frame).toHaveTextContent('Mô tả đang gõ');
    expect(frame).toHaveTextContent('#trẻ-em');
    expect(frame).toHaveTextContent('Nội dung đang gõ');
    expect(frame).not.toHaveTextContent('Chưa có nội dung để xem trước.');
  });

  it('ABW-08 xem trước KHÔNG gọi máy chủ (không lưu); nút Xem trước không phải nút gửi', () => {
    const api = setup();
    fill('Tiêu đề', 'Chưa lưu');

    fireEvent.click(previewButton());

    expect(api.callsTo('create')).toHaveLength(0);
    expect(api.callsTo('update')).toHaveLength(0);
    expect(previewButton()).toHaveAttribute('type', 'button');
  });

  it('ABN-10 trang có xem trước chỉ có MỘT h1 (tiêu đề bài viết trong khung là chữ đậm, không phải h1)', () => {
    setup();
    fill('Tiêu đề', 'Tiêu đề bài');
    fill('Nội dung', '## Tiêu đề phụ\n\nNội dung');

    fireEvent.click(previewButton());

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Viết bài mới',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Tiêu đề phụ' }),
    ).toBeVisible();
    expect(field('Tiêu đề')).toHaveValue('Tiêu đề bài');
  });
});
