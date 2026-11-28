import {
  codePointLength,
  contentIssue,
  isBlankContent,
  isValidTitle,
  normalizeContent,
  normalizeSummary,
  normalizeTitle,
  summaryIssue,
} from './article-content.rules.js';

// article B1: phần THUẦN của ABV-02 (tiêu đề), ABV-11 (mô tả), ABN-02 và ABN-03 (nội dung). Phần qua HTTP ở test/article-admin.e2e-spec.ts.
const LONE_HIGH = String.fromCharCode(0xd800);
const LONE_LOW = String.fromCharCode(0xdc00);

describe('article — tiêu đề (ABV-02)', () => {
  it('ABV-02: chuẩn hoá NFC, gộp mọi dãy khoảng trắng (cả tab và xuống dòng) thành một dấu cách, bỏ khoảng trắng hai đầu', () => {
    const nfd = 'Sốt xuất huyết'.normalize('NFD');
    expect(nfd).not.toBe('Sốt xuất huyết');
    expect(normalizeTitle(nfd)).toBe('Sốt xuất huyết');
    expect(normalizeTitle('  Sốt \t xuất\nhuyết  ')).toBe('Sốt xuất huyết');
  });

  it('ABV-02: rỗng và toàn khoảng trắng không hợp lệ; 255 điểm mã nhận, 256 từ chối (biên)', () => {
    expect(isValidTitle(normalizeTitle(''))).toBe(false);
    expect(isValidTitle(normalizeTitle(' \t\n '))).toBe(false);
    expect(isValidTitle('a'.repeat(255))).toBe(true);
    expect(isValidTitle('a'.repeat(256))).toBe(false);
    expect(isValidTitle('a')).toBe(true);
  });

  it('ABV-02: đếm theo điểm mã sau NFC, không theo đơn vị UTF-16: 255 emoji nhận, 256 từ chối; tiêu đề NFD 255 chữ có dấu nhận sau khi về NFC', () => {
    expect(isValidTitle('😀'.repeat(255))).toBe(true);
    expect(isValidTitle('😀'.repeat(256))).toBe(false);
    const nfd = 'ế'.repeat(255).normalize('NFD');
    expect(nfd.length).toBeGreaterThan(255);
    expect(isValidTitle(normalizeTitle(nfd))).toBe(true);
  });

  it('ABV-02: ký tự điều khiển (NUL, chuông, DEL, C1) và nửa cặp thay thế lẻ làm tiêu đề không hợp lệ', () => {
    for (const bad of [
      'a\x00b',
      'a\x07b',
      'a\x7fb',
      'a\x85b',
      `a${LONE_HIGH}b`,
      `a${LONE_LOW}b`,
    ])
      expect(isValidTitle(normalizeTitle(bad)), JSON.stringify(bad)).toBe(
        false,
      );
  });
});

describe('article — mô tả ngắn (ABV-11)', () => {
  it('ABV-11: rỗng hay toàn khoảng trắng thành null; chữ thì được chuẩn hoá như tiêu đề', () => {
    expect(normalizeSummary('')).toBeNull();
    expect(normalizeSummary('  \n\t ')).toBeNull();
    expect(normalizeSummary('  Cách  phòng \n bệnh ')).toBe('Cách phòng bệnh');
  });

  it('ABV-11: 500 điểm mã nhận, 501 từ chối (MO_TA_QUA_DAI); ký tự điều khiển là MO_TA_KHONG_HOP_LE', () => {
    expect(summaryIssue('a'.repeat(500))).toBeNull();
    expect(summaryIssue('a'.repeat(501))).toBe('MO_TA_QUA_DAI');
    expect(summaryIssue('😀'.repeat(500))).toBeNull();
    expect(summaryIssue('😀'.repeat(501))).toBe('MO_TA_QUA_DAI');
    expect(summaryIssue('a\x00b')).toBe('MO_TA_KHONG_HOP_LE');
    expect(summaryIssue(`a${LONE_HIGH}`)).toBe('MO_TA_KHONG_HOP_LE');
  });
});

describe('article — nội dung (ABN-02, ABN-03)', () => {
  it('ABN-02: `\\r\\n` về `\\n`, NFC, KHÔNG trim và KHÔNG lọc HTML (lưu nguyên văn)', () => {
    expect(normalizeContent('a\r\nb\r\n')).toBe('a\nb\n');
    expect(normalizeContent('Sốt'.normalize('NFD'))).toBe('Sốt');
    const html = '<script>alert(1)</script>\n<img src=x onerror=alert(1)>';
    expect(normalizeContent(`  ${html}  `)).toBe(`  ${html}  `);
    expect(contentIssue(normalizeContent(html))).toBeNull();
    expect(contentIssue('javascript:alert(1)')).toBeNull();
  });

  it('ABN-02: ký tự điều khiển bị từ chối (NUL, chuông, DEL, C1, `\\r` lẻ, nửa cặp thay thế lẻ); xuống dòng và tab được nhận', () => {
    for (const bad of [
      'a\x00b',
      'a\x07b',
      'a\x7fb',
      'a\x9fb',
      'a\rb',
      `a${LONE_HIGH}b`,
      `a${LONE_LOW}b`,
    ])
      expect(contentIssue(normalizeContent(bad)), JSON.stringify(bad)).toBe(
        'NOI_DUNG_KHONG_HOP_LE',
      );
    expect(contentIssue(normalizeContent('a\tb\nc\r\nd'))).toBeNull();
  });

  it('ABN-03: 20.000 điểm mã nhận, 20.001 từ chối (biên theo ký tự)', () => {
    expect(contentIssue('a'.repeat(20_000))).toBeNull();
    expect(contentIssue('a'.repeat(20_001))).toBe('NOI_DUNG_QUA_DAI');
  });

  it('ABN-03: 20.000 chữ tiếng Việt (mỗi chữ 3 byte, đúng 60.000 byte) nhận; 20.001 từ chối', () => {
    const viet = 'ệ'.repeat(20_000);
    expect(Buffer.byteLength(viet, 'utf8')).toBe(60_000);
    expect(contentIssue(viet)).toBeNull();
    expect(contentIssue('ệ'.repeat(20_001))).toBe('NOI_DUNG_QUA_DAI');
  });

  it('ABN-03: 16.000 emoji (16.000 điểm mã nhưng 64.000 byte) bị chặn theo byte; 15.000 emoji (60.000 byte) nhận; 15.001 từ chối', () => {
    expect(codePointLength('😀'.repeat(16_000))).toBe(16_000);
    expect(contentIssue('😀'.repeat(16_000))).toBe('NOI_DUNG_QUA_DAI');
    expect(contentIssue('😀'.repeat(15_000))).toBeNull();
    expect(contentIssue('😀'.repeat(15_001))).toBe('NOI_DUNG_QUA_DAI');
  });

  it('ABN-03: chuỗi dài vừa sai ký tự vừa quá dài báo ký tự không hợp lệ trước', () => {
    expect(contentIssue(`${'a'.repeat(20_001)}\x00`)).toBe(
      'NOI_DUNG_KHONG_HOP_LE',
    );
  });

  it('ABV-03: nội dung rỗng hay toàn khoảng trắng và xuống dòng là "rỗng" (không được xuất bản)', () => {
    expect(isBlankContent('')).toBe(true);
    expect(isBlankContent(' \n\t  ')).toBe(true);
    expect(isBlankContent('a')).toBe(false);
  });
});
