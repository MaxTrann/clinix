import { parseArticleContent } from './parse-article-content';

// article F1, ABN-05: hàm thuần tách nội dung chữ thuần thành khối (PLAN 5.5, T8, Q1).
describe('parseArticleContent (ABN-05)', () => {
  it('ABN-05 rỗng hay chỉ khoảng trắng và dòng trống ⇒ không có khối nào', () => {
    expect(parseArticleContent('')).toEqual([]);
    expect(parseArticleContent('  \n\t\n   ')).toEqual([]);
  });

  it('ABN-05 đoạn: xuống dòng đơn nằm CÙNG đoạn, dòng trống tách đoạn', () => {
    expect(parseArticleContent('Một\nvẫn một\n\nHai')).toEqual([
      { type: 'paragraph', lines: ['Một', 'vẫn một'] },
      { type: 'paragraph', lines: ['Hai'] },
    ]);
  });

  it('ABN-05 nhiều dòng trống liên tiếp, dòng chỉ có khoảng trắng hay tab, đầu và cuối rỗng đều chỉ là dấu ngăn', () => {
    expect(parseArticleContent('\n\nMột\n\n\n\n \t \nHai\n\n')).toEqual([
      { type: 'paragraph', lines: ['Một'] },
      { type: 'paragraph', lines: ['Hai'] },
    ]);
  });

  it('ABN-05 dòng đơn bắt đầu "## " ⇒ tiêu đề phụ (bỏ khoảng trắng thừa hai đầu)', () => {
    expect(parseArticleContent('## Triệu chứng')).toEqual([
      { type: 'heading', text: 'Triệu chứng' },
    ]);
    expect(parseArticleContent('##   Triệu chứng  ')).toEqual([
      { type: 'heading', text: 'Triệu chứng' },
    ]);
  });

  it('ABN-05 mọi dòng bắt đầu "- " ⇒ danh sách', () => {
    expect(parseArticleContent('- Uống nước\n-   Nghỉ ngơi  ')).toEqual([
      { type: 'list', items: ['Uống nước', 'Nghỉ ngơi'] },
    ]);
  });

  it('ABN-05 "##x" (thiếu khoảng trắng) và "-x" là đoạn thường', () => {
    expect(parseArticleContent('##x')).toEqual([
      { type: 'paragraph', lines: ['##x'] },
    ]);
    expect(parseArticleContent('-x\n-y')).toEqual([
      { type: 'paragraph', lines: ['-x', '-y'] },
    ]);
  });

  it('ABN-05 khối lẫn dòng "- " với dòng thường là đoạn (không tách thành danh sách một phần)', () => {
    expect(parseArticleContent('- một\nhai\n- ba')).toEqual([
      { type: 'paragraph', lines: ['- một', 'hai', '- ba'] },
    ]);
  });

  it('ABN-05 tiêu đề phụ dính liền dòng khác (không có dòng trống) là đoạn, không phải tiêu đề', () => {
    expect(parseArticleContent('## Tiêu đề\nNội dung')).toEqual([
      { type: 'paragraph', lines: ['## Tiêu đề', 'Nội dung'] },
    ]);
  });

  it('ABN-05 tiền tố không có chữ phía sau ("## ", "- ") là đoạn, không sinh tiêu đề hay mục rỗng', () => {
    expect(parseArticleContent('## ')).toEqual([
      { type: 'paragraph', lines: ['##'] },
    ]);
    expect(parseArticleContent('##  x\n\n##  ')).toEqual([
      { type: 'heading', text: 'x' },
      { type: 'paragraph', lines: ['##'] },
    ]);
    expect(parseArticleContent('- a\n- ')).toEqual([
      { type: 'paragraph', lines: ['- a', '-'] },
    ]);
  });

  it('ABN-05 thụt đầu dòng làm mất nghĩa tiền tố: "  - a" là đoạn', () => {
    expect(parseArticleContent('  - a')).toEqual([
      { type: 'paragraph', lines: ['- a'] },
    ]);
  });

  it('ABN-05 chấp nhận \\r\\n và \\r làm xuống dòng', () => {
    expect(parseArticleContent('Một\r\n\r\nHai\rBa')).toEqual([
      { type: 'paragraph', lines: ['Một'] },
      { type: 'paragraph', lines: ['Hai', 'Ba'] },
    ]);
  });

  it('ABN-05 HTML trong chữ chỉ là chữ: hàm không diễn giải, giữ nguyên chuỗi', () => {
    const html = '<script>alert(1)</script>';
    expect(parseArticleContent(html)).toEqual([
      { type: 'paragraph', lines: [html] },
    ]);
    expect(parseArticleContent(`## ${html}`)).toEqual([
      { type: 'heading', text: html },
    ]);
  });

  it('ABN-05 tài liệu hỗn hợp theo đúng thứ tự', () => {
    const text = [
      '## Phòng ngừa',
      '',
      'Diệt muỗi.',
      'Ngủ màn.',
      '',
      '- Đổ nước đọng',
      '- Đậy kín lu',
      '',
      'Hết.',
    ].join('\n');
    expect(parseArticleContent(text)).toEqual([
      { type: 'heading', text: 'Phòng ngừa' },
      { type: 'paragraph', lines: ['Diệt muỗi.', 'Ngủ màn.'] },
      { type: 'list', items: ['Đổ nước đọng', 'Đậy kín lu'] },
      { type: 'paragraph', lines: ['Hết.'] },
    ]);
  });
});
