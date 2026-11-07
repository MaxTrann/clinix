import {
  buildLookupPatterns,
  foldDStroke,
  isValidKeyword,
  normalizeKeyword,
  phoneDigits,
} from './keyword-policy.js';

// Task B6 — luật thuần của từ khoá tra cứu (patient PLAN 5.8, Q19; TRACKING B6-B, B6-C, B6-D, B6-G). Mã ca PLK-nn là [đề xuất].
// Dữ liệu là chuỗi giả; không dữ liệu cá nhân thật.
const nfd = (text: string) => text.normalize('NFD');

describe('normalizeKeyword', () => {
  it('PLK-01 (TC-06) chuyển NFC; cắt khoảng trắng ASCII hai đầu (dấu cách, tab, xuống dòng, form feed, vertical tab); không đụng khoảng trắng ở giữa', () => {
    expect(normalizeKeyword(nfd('Nguyễn'))).toBe('Nguyễn');
    expect(nfd('Nguyễn')).not.toBe('Nguyễn');
    expect(normalizeKeyword(' \t\r\n\f\vab cd\v\f\n\r\t ')).toBe('ab cd');
    expect(normalizeKeyword('  a   b  ')).toBe('a   b');
    expect(normalizeKeyword('   ')).toBe('');
  });

  it('PLK-01b (TC-06) KHÔNG cắt khoảng trắng Unicode như U+00A0 (không dùng String.trim)', () => {
    expect(normalizeKeyword(' ab ')).toBe(' ab ');
    expect(isValidKeyword(normalizeKeyword(' ab '))).toBe(true);
    expect(' ab '.trim()).toBe('ab');
  });
});

describe('isValidKeyword', () => {
  it('PLK-02 (TC-06) biên độ dài: 1 sai, 2 đúng, 100 đúng, 101 sai; rỗng sai', () => {
    expect(isValidKeyword('')).toBe(false);
    expect(isValidKeyword('a')).toBe(false);
    expect(isValidKeyword('ab')).toBe(true);
    expect(isValidKeyword('a'.repeat(100))).toBe(true);
    expect(isValidKeyword('a'.repeat(101))).toBe(false);
  });

  it('PLK-02b (TC-06) đếm theo ĐIỂM MÃ, không theo đơn vị UTF-16: 50 emoji (100 đơn vị) đúng, 100 emoji đúng, 101 emoji sai, một emoji sai vì chỉ 1', () => {
    expect('😀'.length).toBe(2);
    expect(isValidKeyword('😀')).toBe(false);
    expect(isValidKeyword('😀😀')).toBe(true);
    expect(isValidKeyword('😀'.repeat(50))).toBe(true);
    expect(isValidKeyword('😀'.repeat(100))).toBe(true);
    expect(isValidKeyword('😀'.repeat(101))).toBe(false);
  });

  it('PLK-02c (TC-06) chuỗi chưa chuẩn hoá bị từ chối (còn khoảng trắng hai đầu hoặc còn dạng NFD), chỉ nhận kết quả của normalizeKeyword', () => {
    expect(isValidKeyword(' ab')).toBe(false);
    expect(isValidKeyword('ab ')).toBe(false);
    expect(isValidKeyword(nfd('Nguyễn'))).toBe(false);
    expect(isValidKeyword(normalizeKeyword(nfd('Nguyễn')))).toBe(true);
  });

  it.each([
    ['NUL', 'a\u0000b'],
    ['tab ở giữa', 'a\tb'],
    ['xuống dòng ở giữa', 'a\nb'],
    ['ZWSP (Cf)', 'a​b'],
    ['U+202E đảo chiều (Cf)', 'a‮b'],
    ['BOM (Cf)', 'a﻿b'],
    ['vùng dùng riêng U+E000 (Co)', 'ab'],
    ['ngắt dòng U+2028 (Zl)', 'a b'],
    ['ngắt đoạn U+2029 (Zp)', 'a b'],
    ['hai NUL', '\u0000\u0000'],
    ['hai ZWSP', '​​'],
  ])('PLK-03 (TC-06) ký tự cấm: %s ⇒ sai', (_label, value) => {
    expect(isValidKeyword(value)).toBe(false);
  });

  it.each(['@g', 'a.b', 'a+b', "o'brien", 'a"b', '100%', 'a_b', 'a\\b', 'a!b'])(
    'PLK-03b (TC-05, TC-06) ký tự thường gặp trong tên, email, SĐT không bị cấm: %s ⇒ đúng',
    (value) => {
      expect(isValidKeyword(value)).toBe(true);
    },
  );
});

describe('foldDStroke', () => {
  it('PLK-04 (TC-01) gấp đ và Đ thành d, ký tự khác (kể cả chữ có dấu khác) nguyên văn', () => {
    expect(foldDStroke('Đặng')).toBe('dặng');
    // Chỉ chữ Đ/đ đổi; phần còn lại (kể cả Ỗ hoa) giữ nguyên, hoa thường do collation lo
    expect(foldDStroke('đặng ĐỖ đào')).toBe('dặng dỖ dào');
    expect(foldDStroke('Nguyễn Văn Dũng')).toBe('Nguyễn Văn Dũng');
    expect(foldDStroke('dang')).toBe('dang');
    expect(foldDStroke('')).toBe('');
  });
});

describe('phoneDigits', () => {
  it.each([
    ['0901234567', '0901234567'],
    ['0901 234 567', '0901234567'],
    ['0901.234.567', '0901234567'],
    ['0901 . 234', '0901234'],
    ['090 1234 567', '0901234567'],
    ['09', '09'],
    ['0 9', '09'],
  ])('PLK-05 (TC-02) %j ⇒ chữ số %j', (keyword, expected) => {
    expect(phoneDigits(keyword)).toBe(expected);
  });

  it.each([
    ['0.', 'chỉ còn một chữ số: ngưỡng tính trên chữ số, không trên từ khoá'],
    ['. .', 'không còn gì sau khi bỏ dấu cách và chấm'],
    ['..', 'không còn gì'],
    ['0901a', 'có chữ'],
    ['a0901', 'có chữ'],
    ['０９０１', 'chữ số toàn góc không phải [0-9]'],
    ['0901-234', 'dấu gạch nối không được bỏ (Q19 chỉ nói dấu cách và chấm)'],
    ['+84901234567', 'tiền tố +84 chưa hỗ trợ'],
    ['0901,234', 'dấu phẩy không được bỏ'],
    ['٠٩٠١', 'chữ số Ả Rập không phải [0-9]'],
  ])('PLK-05b (TC-02) %j ⇒ không tìm SĐT (%s)', (keyword) => {
    expect(phoneDigits(keyword)).toBeNull();
  });
});

describe('buildLookupPatterns', () => {
  it('PLK-06 (TC-05) %, _, ! được escape bằng !, dấu gạch ngược để nguyên, ở cả mẫu họ tên và mẫu email', () => {
    const patterns = buildLookupPatterns('a%b_c!d\\e');
    expect(patterns.name).toBe('%a!%b!_c!!d\\e%');
    expect(patterns.email).toBe('%a!%b!_c!!d\\e%');
    expect(patterns.phone).toBeNull();
  });

  it('PLK-06b (TC-01) mẫu họ tên đã gấp đ và Đ; mẫu email giữ từ khoá nguyên văn', () => {
    const patterns = buildLookupPatterns('Đặng đỗ');
    expect(patterns.name).toBe('%dặng dỗ%');
    expect(patterns.email).toBe('%Đặng đỗ%');
    expect(patterns.phone).toBeNull();
  });

  it('PLK-06c (TC-02) mẫu SĐT chỉ có khi từ khoá toàn chữ số (sau khi bỏ dấu cách và chấm); họ tên và email giữ từ khoá nguyên văn', () => {
    const patterns = buildLookupPatterns('0901 234.567');
    expect(patterns.phone).toBe('%0901234567%');
    expect(patterns.name).toBe('%0901 234.567%');
    expect(patterns.email).toBe('%0901 234.567%');
  });

  it('PLK-06d (TC-02) từ khoá có chữ ⇒ không có mẫu SĐT; "0." ⇒ không có mẫu SĐT', () => {
    expect(buildLookupPatterns('0901a').phone).toBeNull();
    expect(buildLookupPatterns('0.').phone).toBeNull();
    expect(buildLookupPatterns('09').phone).toBe('%09%');
  });
});
