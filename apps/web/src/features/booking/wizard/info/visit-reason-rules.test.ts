import { describe, expect, it } from 'vitest';
import {
  VISIT_REASON_MAX_LENGTH,
  VISIT_REASON_MESSAGES,
  checkVisitReason,
  normalizeVisitReason,
} from './visit-reason-rules';

// booking F4. WZ-03 (PLAN booking 7.15) và BVR-01…BVR-07 là [đề xuất] (mục 7.38). Luật phải KHỚP `apps/api/.../visit-reason.rules.ts` (DL-23): cùng đầu vào, cùng kết luận.
const ok = (value: string | null) => ({ ok: true, value });
const fail = (error: 'tooLong' | 'control') => ({ ok: false, error });

describe('booking F4 — luật "Lý do khám" (hàm thuần)', () => {
  it('BVR-01 rỗng, chỉ khoảng trắng ASCII hay xuống dòng ⇒ null (không nhập, hợp lệ)', () => {
    for (const text of ['', ' ', '   ', '\n\n', ' \t\r\n\f\v ', '\r\n']) {
      expect(checkVisitReason(text)).toEqual(ok(null));
      expect(normalizeVisitReason(text)).toBeNull();
    }
  });

  it('BVR-02 cắt khoảng trắng ASCII hai đầu, giữ ở giữa; U+00A0 KHÔNG bị cắt (khác `trim()`)', () => {
    expect(checkVisitReason('  đau đầu \n')).toEqual(ok('đau đầu'));
    expect(checkVisitReason('a  b\n\nc')).toEqual(ok('a  b\n\nc'));
    // Như backend: U+00A0 không phải khoảng trắng ASCII nên ở lại, kể cả khi là thứ duy nhất
    expect(checkVisitReason(' đau ')).toEqual(ok(' đau '));
    expect(checkVisitReason(' ')).toEqual(ok(' '));
    expect('   '.trim()).toBe(''); // đối chứng: `trim()` Unicode sẽ cắt mất
  });

  it('BVR-03 NFC: NFD ra NFC, độ dài tính SAU NFC; chữ Việt NFC và NFD cùng kết quả', () => {
    const nfc = 'ệ'.repeat(500);
    const nfd = nfc.normalize('NFD');
    expect(nfd.length).toBe(1500);
    expect(normalizeVisitReason(nfd)).toBe(nfc);
    // 500 chữ ở dạng NFD (1500 điểm mã thô) vẫn hợp lệ vì sau NFC chỉ còn 500
    expect(checkVisitReason(nfd)).toEqual(ok(nfc));
    expect(checkVisitReason(nfc)).toEqual(ok(nfc));
    // 501 chữ ở dạng NFD ⇒ quá dài
    expect(checkVisitReason('ệ'.repeat(501).normalize('NFD'))).toEqual(
      fail('tooLong'),
    );
    expect(checkVisitReason('Tôi bị đau lưng')).toEqual(
      checkVisitReason('Tôi bị đau lưng'.normalize('NFD')),
    );
  });

  it('BVR-04 biên đúng 500 hợp lệ, 501 điểm mã bị chặn; cắt khoảng trắng TRƯỚC khi đếm', () => {
    expect(VISIT_REASON_MAX_LENGTH).toBe(500);
    expect(checkVisitReason('a'.repeat(499))).toEqual(ok('a'.repeat(499)));
    expect(checkVisitReason('a'.repeat(500))).toEqual(ok('a'.repeat(500)));
    expect(checkVisitReason('a'.repeat(501))).toEqual(fail('tooLong'));
    expect(checkVisitReason(` ${'a'.repeat(500)} \n`)).toEqual(
      ok('a'.repeat(500)),
    );
    expect(checkVisitReason(`${'a'.repeat(500)} b`)).toEqual(fail('tooLong'));
  });

  it('BVR-05 đếm theo ĐIỂM MÃ: 500 emoji (1000 đơn vị UTF-16) hợp lệ, 501 bị chặn; emoji ghép ZWJ tính từng điểm mã', () => {
    const emoji = '😀'.repeat(500);
    expect(emoji.length).toBe(1000);
    expect(checkVisitReason(emoji)).toEqual(ok(emoji));
    expect(checkVisitReason('😀'.repeat(501))).toEqual(fail('tooLong'));
    // 👨‍👩‍👧 = 5 điểm mã (3 emoji + 2 ZWJ): 100 lần là đúng 500, 101 lần là 505. ZWJ thuộc Cf nên không bị coi là ký tự điều khiển
    const family = '👨‍👩‍👧';
    expect(Array.from(family)).toHaveLength(5);
    expect(checkVisitReason(family.repeat(100)).ok).toBe(true);
    expect(checkVisitReason(family.repeat(101))).toEqual(fail('tooLong'));
  });

  it('BVR-06 ký tự điều khiển bị chặn (Tab, NUL, U+0007, U+000B, U+000C, U+007F, U+0085); xuống dòng và ZWJ được phép', () => {
    for (const control of [
      '\t',
      '\u0000',
      '\u0007',
      '\u000b',
      '\u000c',
      '\u007f',
      '\u0085',
    ]) {
      expect(checkVisitReason(`a${control}b`)).toEqual(fail('control'));
    }
    // Ở rìa thì khoảng trắng ASCII bị cắt trước (Tab, \v, \f), còn ký tự điều khiển khác vẫn bị chặn
    expect(checkVisitReason('\tabc')).toEqual(ok('abc'));
    expect(checkVisitReason('\u0007abc')).toEqual(fail('control'));
    expect(checkVisitReason('a\nb')).toEqual(ok('a\nb'));
    expect(checkVisitReason('a\r\nb')).toEqual(ok('a\r\nb'));
    expect(checkVisitReason('a‍b')).toEqual(ok('a‍b'));
    // Ký tự điều khiển báo trước độ dài
    expect(checkVisitReason(`${'a'.repeat(600)}\u0007`)).toEqual(
      fail('control'),
    );
  });

  it('BVR-07 bảng vectơ đối chiếu backend (DL-23); chuẩn hoá luỹ đẳng; thuộc tính trên 20.000 chuỗi hạt cố định', () => {
    const vectors: [string, unknown][] = [
      ['đau lưng 2 tuần', ok('đau lưng 2 tuần')],
      ['', ok(null)],
      [' ', ok(' ')],
      ['a'.repeat(500), ok('a'.repeat(500))],
      ['a'.repeat(501), fail('tooLong')],
      ['😀'.repeat(500), ok('😀'.repeat(500))],
      ['😀'.repeat(501), fail('tooLong')],
      ['a\tb', fail('control')],
      ['dòng một\ndòng hai', ok('dòng một\ndòng hai')],
      ['é', ok('é')],
    ];
    for (const [input, expected] of vectors) {
      expect(checkVisitReason(input)).toEqual(expected);
    }

    // Thuộc tính: kết quả `ok` với giá trị luôn đã chuẩn hoá, đúng độ dài, không ký tự điều khiển; kết quả lỗi đúng nguyên nhân
    let seed = 20261113;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const alphabet = [
      'a',
      'b',
      'ệ',
      'ệ',
      ' ',
      ' ',
      '\n',
      '\r',
      '\t',
      '\u0007',
      '😀',
      '‍',
      'é',
      'é',
      '\f',
    ];
    // Chuỗi dài (mỗi 50 chuỗi một lần) dùng bộ ký tự KHÔNG có ký tự điều khiển, nếu không nhánh `control` luôn chặn trước nhánh quá dài
    const safeAlphabet = ['a', 'b', 'ệ', 'ệ', ' ', ' ', '\n', '😀', 'é', 'é'];
    let accepted = 0;
    let tooLong = 0;
    let control = 0;
    for (let i = 0; i < 20_000; i++) {
      const long = i % 50 === 0;
      const pool = long ? safeAlphabet : alphabet;
      const length = Math.floor(random() * (long ? 700 : 30));
      let text = '';
      for (let j = 0; j < length; j++) {
        text += pool[Math.floor(random() * pool.length)];
      }
      const normalized = normalizeVisitReason(text);
      // Luỹ đẳng
      expect(normalizeVisitReason(normalized ?? '')).toBe(normalized);
      const result = checkVisitReason(text);
      if (result.ok) {
        accepted++;
        if (result.value !== null) {
          expect(result.value.normalize('NFC')).toBe(result.value);
          expect(Array.from(result.value).length).toBeLessThanOrEqual(500);
          expect(/[^\P{Cc}\n\r]/u.test(result.value)).toBe(false);
        }
      } else if (result.error === 'control') {
        control++;
        expect(/[^\P{Cc}\n\r]/u.test(normalized ?? '')).toBe(true);
      } else {
        tooLong++;
        expect(Array.from(normalized ?? '').length).toBeGreaterThan(500);
      }
    }
    // Bộ thử có tác dụng: cả ba nhánh đều được chạm nhiều lần
    expect(accepted).toBeGreaterThan(1000);
    expect(control).toBeGreaterThan(1000);
    expect(tooLong).toBeGreaterThan(10);
  });

  it('BVR-03 câu lỗi: `tooLong` đúng chữ PLAN 5.14, `control` là câu riêng cho đúng nguyên nhân', () => {
    expect(VISIT_REASON_MESSAGES.tooLong).toBe(
      'Lý do khám không hợp lệ (tối đa 500 ký tự).',
    );
    expect(VISIT_REASON_MESSAGES.control).not.toContain('500');
  });
});
