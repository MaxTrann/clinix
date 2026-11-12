import { describe, expect, it } from 'vitest';
import {
  KEYWORD_MAX_LENGTH,
  KEYWORD_MIN_LENGTH,
  checkKeyword,
} from './keyword-rules';

// booking F1, mức hàm của LHL-06 (PLAN booking mục 7.31 sau khi duyệt; PLAN Q35: `q` 2 đến 100 ký tự, chuẩn hoá NFC). Ca ở mức trang (hẹn giờ, Enter, ghép dấu)
// ở `appointment-list-filters.test.tsx`.
describe('booking F1 — luật từ khoá ô tìm', () => {
  it('LHL-06 biên độ dài: 0, 1 ⇒ short; 2, 100 ⇒ hợp lệ; 101 ⇒ long', () => {
    expect([KEYWORD_MIN_LENGTH, KEYWORD_MAX_LENGTH]).toEqual([2, 100]);
    expect(checkKeyword('').problem).toBe('short');
    expect(checkKeyword('a').problem).toBe('short');
    expect(checkKeyword('ab').problem).toBeNull();
    expect(checkKeyword('a'.repeat(100)).problem).toBeNull();
    expect(checkKeyword('a'.repeat(101)).problem).toBe('long');
  });

  it('LHL-06 cắt khoảng trắng ASCII hai đầu (cách, tab, xuống dòng) rồi mới đếm: " a " vẫn là một ký tự', () => {
    expect(checkKeyword(' \t\n\r\f\vab \t')).toEqual({
      keyword: 'ab',
      length: 2,
      problem: null,
    });
    expect(checkKeyword('  a  ').problem).toBe('short');
    expect(checkKeyword('   ')).toEqual({
      keyword: '',
      length: 0,
      problem: 'short',
    });
    // Khoảng trắng ở giữa được giữ và được đếm
    expect(checkKeyword('a b')).toEqual({
      keyword: 'a b',
      length: 3,
      problem: null,
    });
  });

  // API chỉ cắt khoảng trắng ASCII: `String.trim()` còn cắt U+00A0 và khoảng trắng Unicode nên hai bên sẽ hiểu cùng một từ khoá khác nhau
  it('LHL-06 KHÔNG cắt U+00A0 và khoảng trắng Unicode (khác `String.trim`)', () => {
    expect(checkKeyword(' ab ').keyword).toBe(' ab ');
    expect(checkKeyword(' ab ').length).toBe(4);
    expect(checkKeyword(' a').problem).toBeNull();
  });

  it('LHL-06 đưa về NFC trước khi đếm: `e` + hai dấu rời là MỘT điểm mã `ễ`', () => {
    const decomposed = 'Nguyễn';
    expect(decomposed).toHaveLength(8);
    expect(checkKeyword(decomposed)).toEqual({
      keyword: 'Nguyễn',
      length: 6,
      problem: null,
    });
  });

  // Đếm theo điểm mã như MySQL đếm `varchar`, không theo `.length` của JavaScript (một emoji là 2 đơn vị UTF-16)
  it('LHL-06 đếm theo ĐIỂM MÃ: một emoji là một ký tự; 100 điểm mã (199 đơn vị UTF-16) hợp lệ', () => {
    expect(checkKeyword('\u{1f600}').problem).toBe('short');
    expect(checkKeyword('\u{1f600}\u{1f600}').problem).toBeNull();
    const hundred = `a${'\u{1f600}'.repeat(99)}`;
    expect(hundred.length).toBe(199);
    expect(checkKeyword(hundred)).toMatchObject({ length: 100, problem: null });
    expect(checkKeyword(`${hundred}b`)).toMatchObject({
      length: 101,
      problem: 'long',
    });
  });

  // Ký tự điều khiển để API chặn (400 `TU_KHOA_KHONG_HOP_LE`): client không từ chối, chỉ kiểm độ dài
  it('LHL-06 ký tự điều khiển KHÔNG bị client từ chối (API chặn): độ dài hợp lệ thì problem là null', () => {
    expect(checkKeyword('a\u0001b').problem).toBeNull();
  });
});
