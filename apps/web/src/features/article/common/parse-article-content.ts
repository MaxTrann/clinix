// Trình dựng nội dung bài viết (PLAN article 5.5, T8, Q1): nội dung là CHỮ THUẦN, hàm này chỉ tách thành khối. Không HTML, không Markdown đầy đủ.
//   - khối = các dòng liền nhau, ngăn cách bằng một hay nhiều dòng trống (dòng chỉ có khoảng trắng cũng là dòng trống);
//   - một dòng bắt đầu `## ` (có chữ sau đó) ⇒ tiêu đề phụ;
//   - khối mà MỌI dòng bắt đầu `- ` (có chữ sau đó) ⇒ danh sách;
//   - còn lại ⇒ đoạn (xuống dòng đơn giữ thành các dòng của đoạn). `##x` (thiếu khoảng trắng) và khối lẫn dòng `- ` với dòng thường là đoạn.
export type ArticleBlock =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] };

const HEADING_PREFIX = '## ';
const LIST_PREFIX = '- ';

// Phần chữ sau tiền tố, hoặc null khi dòng không bắt đầu bằng tiền tố hay không có chữ sau nó
function textAfter(line: string, prefix: string): string | null {
  if (!line.startsWith(prefix)) return null;
  const rest = line.slice(prefix.length).trim();
  return rest === '' ? null : rest;
}

function toBlock(lines: string[]): ArticleBlock {
  if (lines.length === 1) {
    const heading = textAfter(lines[0], HEADING_PREFIX);
    if (heading !== null) return { type: 'heading', text: heading };
  }
  const items = lines.map((line) => textAfter(line, LIST_PREFIX));
  if (items.every((item): item is string => item !== null)) {
    return { type: 'list', items };
  }
  return { type: 'paragraph', lines: lines.map((line) => line.trim()) };
}

export function parseArticleContent(text: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let current: string[] = [];
  for (const line of text.replace(/\r\n?/gu, '\n').split('\n')) {
    if (line.trim() === '') {
      if (current.length > 0) blocks.push(toBlock(current));
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(toBlock(current));
  return blocks;
}
