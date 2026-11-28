import { render } from '@testing-library/react';
import { useArticleMeta, type ArticleMeta } from './use-article-meta';

// article F2, ABG-09: hook đặt tiêu đề tab và `meta name="description"`, khôi phục khi rời trang (PLAN article T15). Quét mã: chỉ danh sách và chi tiết dùng hook.
const SOURCES = import.meta.glob(['./*.{ts,tsx}', '!./*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function Probe({ meta }: { meta: ArticleMeta | null }) {
  useArticleMeta(meta);
  return null;
}

const descriptionTags = () =>
  document.head.querySelectorAll('meta[name="description"]');

beforeEach(() => {
  document.title = 'CLINIX';
  document.head
    .querySelectorAll('meta[name="description"]')
    .forEach((tag) => tag.remove());
});

afterEach(() => {
  document.head
    .querySelectorAll('meta[name="description"]')
    .forEach((tag) => tag.remove());
  document.title = '';
});

describe('useArticleMeta', () => {
  it('ABG-09 đặt tiêu đề và tạo thẻ meta description; rời trang thì trả tiêu đề cũ và GỠ thẻ do hook tạo', () => {
    const { unmount } = render(
      <Probe
        meta={{ title: 'Sốt xuất huyết | CLINIX', description: 'Mô tả bài' }}
      />,
    );
    expect(document.title).toBe('Sốt xuất huyết | CLINIX');
    expect(descriptionTags()).toHaveLength(1);
    expect(descriptionTags()[0].getAttribute('content')).toBe('Mô tả bài');

    unmount();
    expect(document.title).toBe('CLINIX');
    expect(descriptionTags()).toHaveLength(0);
  });

  it('ABG-09 thẻ meta có sẵn ⇒ dùng lại (không tạo thêm), rời trang thì trả nội dung cũ', () => {
    const existing = document.createElement('meta');
    existing.setAttribute('name', 'description');
    existing.setAttribute('content', 'Mô tả gốc');
    document.head.appendChild(existing);

    const { unmount } = render(
      <Probe meta={{ title: 'A | CLINIX', description: 'Mô tả A' }} />,
    );
    expect(descriptionTags()).toHaveLength(1);
    expect(existing.getAttribute('content')).toBe('Mô tả A');

    unmount();
    expect(descriptionTags()).toHaveLength(1);
    expect(existing.getAttribute('content')).toBe('Mô tả gốc');
  });

  it('ABG-09 thẻ meta có sẵn nhưng không có `content` ⇒ rời trang bỏ lại đúng như cũ (không có content)', () => {
    const existing = document.createElement('meta');
    existing.setAttribute('name', 'description');
    document.head.appendChild(existing);

    const { unmount } = render(
      <Probe meta={{ title: 'A | CLINIX', description: 'Mô tả A' }} />,
    );
    expect(existing.getAttribute('content')).toBe('Mô tả A');
    unmount();
    expect(existing.hasAttribute('content')).toBe(false);
  });

  it('ABG-09 `null` (đang tải, lỗi, 404, đang chuyển hướng) ⇒ không đổi gì', () => {
    render(<Probe meta={null} />);
    expect(document.title).toBe('CLINIX');
    expect(descriptionTags()).toHaveLength(0);
  });

  it('ABG-09 đổi bài (props đổi) ⇒ tiêu đề mới, vẫn MỘT thẻ meta; về `null` ⇒ trả lại tiêu đề gốc', () => {
    const { rerender } = render(
      <Probe meta={{ title: 'A | CLINIX', description: 'a' }} />,
    );
    rerender(<Probe meta={{ title: 'B | CLINIX', description: 'b' }} />);
    expect(document.title).toBe('B | CLINIX');
    expect(descriptionTags()).toHaveLength(1);
    expect(descriptionTags()[0].getAttribute('content')).toBe('b');

    rerender(<Probe meta={null} />);
    expect(document.title).toBe('CLINIX');
    expect(descriptionTags()).toHaveLength(0);
  });

  it('ABG-09 chữ có `<`, `"`, `&` được gán như chữ thường (thuộc tính và textContent), không thành phần tử', () => {
    const hostile =
      '<script>alert(1)</script> "x" & <img src=x onerror=alert(1)>';
    render(<Probe meta={{ title: hostile, description: hostile }} />);
    expect(document.title).toBe(hostile);
    expect(descriptionTags()[0].getAttribute('content')).toBe(hostile);
    expect(document.head.querySelector('script')).toBeNull();
    expect(document.head.querySelector('img')).toBeNull();
  });
});

describe('phạm vi dùng hook (ABG-09)', () => {
  it('ABG-09 chỉ trang danh sách và trang chi tiết import `use-article-meta` (khối trang chủ, 404 và các file khác thì không)', () => {
    const users = Object.entries(SOURCES)
      .filter(([file]) => !file.endsWith('use-article-meta.ts'))
      .filter(([, source]) => /use-article-meta/.test(source))
      .map(([file]) => file)
      .sort();
    expect(users).toEqual([
      './article-detail-page.tsx',
      './article-list-page.tsx',
    ]);
  });

  it('ABG-09 bộ quét có tác dụng: thấy hai trang thật và `use-article-meta.ts` (không xanh giả vì glob rỗng)', () => {
    expect(Object.keys(SOURCES)).toEqual(
      expect.arrayContaining([
        './article-detail-page.tsx',
        './article-list-page.tsx',
        './use-article-meta.ts',
        './home-handbook-section.tsx',
      ]),
    );
  });
});
