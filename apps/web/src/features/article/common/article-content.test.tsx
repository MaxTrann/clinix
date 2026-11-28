import { render, screen } from '@testing-library/react';
import { ArticleContent } from './article-content';

// article F1: component dựng nội dung dùng chung cho "Xem trước" và trang công khai (PLAN 5.5, T8). Nội dung chỉ là CHỮ.
const HOSTILE = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[bấm](javascript:alert(1))',
  '&lt;b&gt;đậm&lt;/b&gt;',
].join('\n\n');

describe('ArticleContent', () => {
  it('ABN-06 <script>, <img onerror>, [a](javascript:…) và &lt; hiện THÀNH CHỮ, không có phần tử nguy hiểm nào', () => {
    const { container } = render(<ArticleContent text={HOSTILE} />);

    expect(container.querySelector('script, img, a')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    // đúng từng ký tự, kể cả "&lt;" không bị giải mã
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.textContent).toContain('[bấm](javascript:alert(1))');
    expect(container.textContent).toContain('&lt;b&gt;đậm&lt;/b&gt;');
  });

  it('ABN-06 mã độc nằm trong tiêu đề phụ và danh sách cũng chỉ là chữ', () => {
    const { container } = render(
      <ArticleContent
        text={
          '## <img src=x onerror=alert(1)>\n\n- <script>x</script>\n- [a](javascript:x)'
        }
      />,
    );

    expect(container.querySelector('script, img, a')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '<img src=x onerror=alert(1)>',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('ABN-07 từ rất dài: vùng nội dung có lớp ngắt từ để không tràn ngang', () => {
    const { container } = render(<ArticleContent text={'x'.repeat(500)} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain('break-words');
    expect(root.className).toContain('[overflow-wrap:anywhere]');
    expect(container.textContent).toBe('x'.repeat(500));
  });

  it('ABN-09 URL dạng chữ hiện thành chữ, không thành liên kết', () => {
    const { container } = render(
      <ArticleContent text="Xem https://x.vn/bai hoặc www.clinix.vn nhé" />,
    );

    expect(container.querySelector('a')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(container.textContent).toBe(
      'Xem https://x.vn/bai hoặc www.clinix.vn nhé',
    );
  });

  it('ABN-10 "## Tiêu đề phụ" thành h2; thành phần KHÔNG BAO GIỜ sinh h1 (h1 là tiêu đề bài do trang đặt)', () => {
    render(
      <ArticleContent
        text={'# Một dấu thăng\n\n## Tiêu đề phụ\n\n### ba dấu'}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Tiêu đề phụ' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(0);
  });

  it('ABN-05 đoạn giữ xuống dòng đơn bằng <br>; danh sách thành <ul><li>', () => {
    const { container } = render(
      <ArticleContent text={'Dòng một\nDòng hai\n\n- Mục A\n- Mục B'} />,
    );

    const paragraph = container.querySelector('p') as HTMLElement;
    expect(paragraph.querySelectorAll('br')).toHaveLength(1);
    expect(paragraph.textContent).toBe('Dòng mộtDòng hai');
    expect(
      Array.from(container.querySelectorAll('ul > li'), (li) => li.textContent),
    ).toEqual(['Mục A', 'Mục B']);
  });

  it('ABN-05 nội dung rỗng không làm hỏng: vùng nội dung có mặt và không có chữ', () => {
    const { container } = render(<ArticleContent text="" />);

    expect(container.firstElementChild).not.toBeNull();
    expect(container.textContent).toBe('');
  });
});
