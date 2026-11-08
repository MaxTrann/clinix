import {
  KEYWORD_MAX_LENGTH,
  KEYWORD_MIN_LENGTH,
  keywordLength,
  keywordProblem,
  normalizeKeyword,
} from './lookup-keyword';

// patient F8 (TRACKING F8-E, F8-I): luật từ khoá của ô tìm, chép từ `keyword-policy.ts` của API (B6). Mã ca LV-nn là [đề xuất];
// mỗi ca ghi mã TC của PLAN mục 7.3 và rủi ro H5 (từ khoá là dữ liệu cá nhân, web chặn trước khi gọi).
describe('normalizeKeyword', () => {
  it('LV-01 TC-18 cắt khoảng trắng ASCII hai đầu (dấu cách, tab, xuống dòng, form feed, tab dọc)', () => {
    expect(normalizeKeyword(' \t\n\r\f\v nguyen \t\n\r\f\v')).toBe('nguyen');
  });

  it('LV-02 TC-18 KHÔNG cắt U+00A0 và khoảng trắng Unicode (API chỉ cắt ASCII, String.trim() sẽ lệch)', () => {
    expect(normalizeKeyword(' nguyen')).toBe(' nguyen');
    expect(normalizeKeyword('nguyen ')).toBe('nguyen ');
  });

  it('LV-03 TC-18 chuẩn hoá NFC: chữ tổ hợp (e + dấu) thành một điểm mã', () => {
    const composed = 'Nguyễn'; // ê + dấu ngã, dạng NFD
    expect(normalizeKeyword(composed)).toBe('Nguyễn');
    expect(keywordLength(normalizeKeyword(composed))).toBe(6);
  });

  it('LV-04 TC-18 khoảng trắng ở GIỮA được giữ nguyên', () => {
    expect(normalizeKeyword('  nguyen  van ')).toBe('nguyen  van');
  });
});

describe('keywordProblem', () => {
  it('LV-05 TC-18 biên 2 và 100 điểm mã: hợp lệ; 1 ⇒ short; 101 ⇒ long; rỗng ⇒ short', () => {
    expect(KEYWORD_MIN_LENGTH).toBe(2);
    expect(KEYWORD_MAX_LENGTH).toBe(100);
    expect(keywordProblem('')).toBe('short');
    expect(keywordProblem('a')).toBe('short');
    expect(keywordProblem('ab')).toBeNull();
    expect(keywordProblem('a'.repeat(100))).toBeNull();
    expect(keywordProblem('a'.repeat(101))).toBe('long');
  });

  it.each([
    ['một emoji', '😀'],
    ['một emoji cộng một chữ', '😀a'],
  ])('LV-06 TC-18 đếm theo ĐIỂM MÃ, không theo UTF-16: %s', (_name, text) => {
    // `'😀'.length` là 2 (UTF-16) nhưng chỉ là 1 điểm mã
    expect(text.length).toBeGreaterThan(Array.from(text).length);
    expect(keywordProblem(text)).toBe(text === '😀' ? 'short' : null);
  });

  it('LV-07 TC-18 100 emoji (200 đơn vị UTF-16) vẫn hợp lệ; 101 emoji ⇒ long', () => {
    expect(keywordProblem('😀'.repeat(100))).toBeNull();
    expect(keywordProblem('😀'.repeat(101))).toBe('long');
  });

  it.each([
    ['tab ở giữa', 'ng\tuyen'],
    ['xuống dòng ở giữa', 'ng\nuyen'],
    ['ký tự điều khiển (chuông)', 'ng\u0007uyen'],
    ['ký tự vô hình U+200B', 'ng​uyen'],
    ['dấu đảo chiều U+202E', 'ng‮uyen'],
    ['dấu phân đoạn U+2028', 'ng uyen'],
    ['dấu phân đoạn đoạn văn U+2029', 'ng uyen'],
  ])('LV-08 H5 ký tự cấm ⇒ invalid: %s', (_name, text) => {
    expect(keywordProblem(text)).toBe('invalid');
  });

  it('LV-09 TC-18 ký tự cấm được xét trước độ dài (một ký tự vô hình ⇒ invalid, không phải short)', () => {
    expect(keywordProblem('​')).toBe('invalid');
  });

  it('LV-10 TC-18 họ tên tiếng Việt, số điện thoại, email bình thường đều hợp lệ', () => {
    expect(keywordProblem('Nguyễn Văn Á')).toBeNull();
    expect(keywordProblem('0901 234.567')).toBeNull();
    expect(keywordProblem('a.b+c@example.invalid')).toBeNull();
    // U+00A0 không bị cấm (API không cấm)
    expect(keywordProblem('ng uyen')).toBeNull();
  });
});
