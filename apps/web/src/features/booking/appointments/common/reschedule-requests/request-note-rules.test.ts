import { describe, expect, it } from 'vitest';
import { checkRequestNote } from './request-note-rules';

// reschedule F4 Pha B1, WXD-82 `[đề xuất]` (PLAN reschedule 5.7: ghi chú xử lý `trim`, 1 đến 255; kế hoạch B9 2.5: `@RequiredReason({ rejectSecrets: true })` cộng "không ký tự điều khiển trừ xuống dòng"): luật ô ghi chú của
// hộp Duyệt và Từ chối. Đếm ĐƠN VỊ UTF-16 (một biểu tượng chiếm 2), cắt bằng `String.prototype.trim()` như máy chủ, KHÔNG chuẩn hoá NFC. Khác luật ô lý do của F2 (NFC, điểm mã). Hàm thuần.
const ok = (value: string) => ({ ok: true, value });
const bad = (error: 'required' | 'tooLong' | 'control') => ({
  ok: false,
  error,
});

describe('luật ô ghi chú xử lý', () => {
  it('WXD-82 biên độ dài: 0 ⇒ bắt buộc; 1 và 255 đơn vị đạt; 256 ⇒ quá dài', () => {
    expect(checkRequestNote('')).toEqual(bad('required'));
    expect(checkRequestNote('a')).toEqual(ok('a'));
    expect(checkRequestNote('a'.repeat(255))).toEqual(ok('a'.repeat(255)));
    expect(checkRequestNote('a'.repeat(256))).toEqual(bad('tooLong'));
  });

  it('WXD-82 đếm ĐƠN VỊ UTF-16: 127 biểu tượng (254 đơn vị) đạt, 128 biểu tượng (256 đơn vị) quá dài; cặp thay thế ở biên', () => {
    expect(checkRequestNote('😀'.repeat(127)).ok).toBe(true);
    expect(checkRequestNote('😀'.repeat(128))).toEqual(bad('tooLong'));
    // 253 chữ thường cộng một biểu tượng = đúng 255 đơn vị; 254 cộng một biểu tượng = 256
    expect(checkRequestNote(`${'a'.repeat(253)}😀`).ok).toBe(true);
    expect(checkRequestNote(`${'a'.repeat(254)}😀`)).toEqual(bad('tooLong'));
  });

  it('WXD-82 toàn khoảng trắng (kể cả không ngắt U+00A0 và BOM U+FEFF) ⇒ bắt buộc: cắt bằng `trim()` như máy chủ', () => {
    for (const blank of [
      ' ',
      '   ',
      '\t\n',
      '\u00a0',
      '\u00a0\u00a0 ',
      '\ufeff',
      '\u2003',
    ]) {
      expect(checkRequestNote(blank), JSON.stringify(blank)).toEqual(
        bad('required'),
      );
    }
  });

  it('WXD-82 cắt hai đầu rồi mới đếm: 255 chữ có khoảng trắng bao quanh đạt; giá trị trả về là chữ ĐÃ cắt (đúng chữ sẽ gửi)', () => {
    expect(checkRequestNote(`  ${'a'.repeat(255)}  `)).toEqual(
      ok('a'.repeat(255)),
    );
    expect(checkRequestNote('\u00a0 xong \t')).toEqual(ok('xong'));
    expect(checkRequestNote(`${' '.repeat(10)}${'a'.repeat(256)}`)).toEqual(
      bad('tooLong'),
    );
  });

  it('WXD-82 xuống dòng được phép (`\\n`, `\\r\\n`); ký tự điều khiển khác (NUL, Tab ở giữa, ESC, DEL, NEL) ⇒ `control`', () => {
    expect(checkRequestNote('Dòng một\nDòng hai')).toEqual(
      ok('Dòng một\nDòng hai'),
    );
    expect(checkRequestNote('Dòng một\r\nDòng hai').ok).toBe(true);
    for (const control of [
      'a\u0000b',
      'a\tb',
      'a\u001bb',
      'a\u007fb',
      'a\u0085b',
      '\u0001x',
    ]) {
      expect(checkRequestNote(control), JSON.stringify(control)).toEqual(
        bad('control'),
      );
    }
  });

  it('WXD-82 KHÔNG chuẩn hoá NFC (như `trim()` của máy chủ): chữ tổ hợp giữ nguyên và đếm theo đơn vị thật', () => {
    const decomposed = 'e\u0301'; // "é" dạng tổ hợp: 2 đơn vị
    expect(checkRequestNote(decomposed)).toEqual(ok(decomposed));
    expect(checkRequestNote(decomposed.repeat(128))).toEqual(bad('tooLong'));
    expect(checkRequestNote(decomposed.repeat(127)).ok).toBe(true);
  });

  it('WXD-82 độ dài được báo TRƯỚC ký tự điều khiển (một lỗi mỗi lần); chữ HTML không bị đụng', () => {
    expect(checkRequestNote(`${'a'.repeat(300)}\u0000`)).toEqual(
      bad('tooLong'),
    );
    expect(checkRequestNote('<b>đậm</b> & "trích"')).toEqual(
      ok('<b>đậm</b> & "trích"'),
    );
  });
});
