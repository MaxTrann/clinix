import { chu, thucThe } from '../testing/reply-fixtures';
import { doanPlainText, normalizeDoan } from './doan-text';

// Chatbot F1 (K1 của phiên kiểm 27/11/2026): ngắt đoạn nằm trong `chu`; web gộp từ 3 xuống dòng trở lên thành 2.
const texts = (parts: ReturnType<typeof normalizeDoan>) =>
  parts.map((part) => part.chu);

describe('normalizeDoan', () => {
  it('WTL-03 (K1) gộp ba xuống dòng liên tiếp trở lên thành hai; một và hai giữ nguyên', () => {
    expect(texts(normalizeDoan([chu('A\n\n\n\n\nB')]))).toEqual(['A\n\nB']);
    expect(texts(normalizeDoan([chu('A\nB\n\nC')]))).toEqual(['A\nB\n\nC']);
  });

  it('WTL-03 (K1) gộp cả khi các xuống dòng nằm ở hai phần tử kề nhau (không thêm gì giữa các phần tử)', () => {
    expect(doanPlainText([chu('A\n\n'), chu('\n\nB')])).toBe('A\n\nB');
    expect(doanPlainText([chu('A\n'), chu('\nB')])).toBe('A\n\nB');
    expect(doanPlainText([chu('A'), chu('B')])).toBe('AB');
  });

  it('WTL-03 bỏ xuống dòng ở đầu và cuối, và bỏ phần tử chỉ còn xuống dòng', () => {
    expect(texts(normalizeDoan([chu('\n\nA\n\n')]))).toEqual(['A']);
    expect(texts(normalizeDoan([chu('\n'), chu('\n\n'), chu('A')]))).toEqual([
      'A',
    ]);
    expect(normalizeDoan([chu('\n\n')])).toEqual([]);
    expect(normalizeDoan([])).toEqual([]);
  });

  it('F1-03 tên thực thể nằm giữa chữ vẫn giữ nguyên; xuống dòng ở hai phía của thực thể không bị gộp lẫn nhau', () => {
    const parts = normalizeDoan([
      chu('Gặp '),
      thucThe('BacSi', '12', 'BS. Mẫu'),
      chu('\n\n\nHết'),
    ]);
    expect(parts.map((part) => part.kieu)).toEqual(['chu', 'thucThe', 'chu']);
    expect(doanPlainText(parts)).toBe('Gặp BS. Mẫu\n\nHết');
  });

  it('F1-04 đổi CRLF thành LF', () => {
    expect(doanPlainText([chu('A\r\nB\rC')])).toBe('A\nB\nC');
  });
});
