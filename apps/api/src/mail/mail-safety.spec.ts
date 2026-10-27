import {
  MAIL_ADDRESS_MAX_LENGTH,
  MAIL_LOCAL_PART_MAX_LENGTH,
  MAIL_SUBJECT_MAX_LENGTH,
  MAIL_TEXT_MAX_LENGTH,
  isSafeBodyText,
  isSafeHeaderText,
  isSafeMailAddress,
  toSingleLine,
} from './mail-safety.js';

// Task P4. Không có mã test case riêng trong plan; truy vết ĐK b6, QMK b5. Mã nội bộ MAIL-01… là [đề xuất] (xem TRACKING P4).
// Kiểm người nhận/tiêu đề trước khi dựng thư: nodemailer 10.2.1 để lọt "a@x\r\nBcc: evil@x" thành người nhận evil@x (đã chạy thật).
const char = (code: number): string => String.fromCharCode(code);
const CR = char(13);
const LF = char(10);

describe('isSafeMailAddress (MAIL-01: đúng một địa chỉ an toàn)', () => {
  it.each([
    'a@example.com',
    'nguyen.van-a_b@sub.example.co',
    'a+tag@example.com',
    "o'brien@example.com",
    'a%b@example.com',
    '{a}|b~@example.com',
    'a=b?c^d@example.com',
    'x@a',
  ])('chấp nhận %s', (address) => {
    expect(isSafeMailAddress(address)).toBe(true);
  });

  it('biên độ dài: phần trước @ tối đa 64, cả địa chỉ tối đa 255 (bằng chính sách A1)', () => {
    const domain = (length: number) => `${'b'.repeat(length - 4)}.com`;
    expect(
      isSafeMailAddress(`${'a'.repeat(MAIL_LOCAL_PART_MAX_LENGTH)}@x.com`),
    ).toBe(true);
    expect(
      isSafeMailAddress(`${'a'.repeat(MAIL_LOCAL_PART_MAX_LENGTH + 1)}@x.com`),
    ).toBe(false);
    const at255 = `a@${domain(MAIL_ADDRESS_MAX_LENGTH - 2)}`;
    expect(at255).toHaveLength(MAIL_ADDRESS_MAX_LENGTH);
    expect(isSafeMailAddress(at255)).toBe(true);
    expect(isSafeMailAddress(`${at255}x`)).toBe(false);
  });

  it.each([
    [
      'CRLF + Bcc (chèn người nhận)',
      `a@example.com${CR}${LF}Bcc: evil@example.com`,
    ],
    ['chỉ LF', `a@example.com${LF}evil@example.com`],
    ['chỉ CR', `a@example.com${CR}evil@example.com`],
    ['hai địa chỉ, dấu phẩy', 'a@example.com,b@example.com'],
    ['hai địa chỉ, dấu phẩy + cách', 'a@example.com, b@example.com'],
    ['hai địa chỉ, chấm phẩy', 'a@example.com;b@example.com'],
    ['hai địa chỉ, dấu cách', 'a@example.com b@example.com'],
    // Chỉ MỘT dấu @: dấu phẩy/chấm phẩy nằm trong phần trước hoặc sau @ vẫn phải bị chặn riêng (không nhờ luật "một dấu @")
    ['dấu phẩy trong phần trước @', 'a,evil@example.com'],
    ['chấm phẩy trong phần trước @', 'a;evil@example.com'],
    ['dấu phẩy trong tên miền', 'a@example.com,evil'],
    ['chấm phẩy trong tên miền', 'a@exam;ple.com'],
    ['tên hiển thị + ngoặc nhọn', 'Ten <a@example.com>'],
    ['chỉ ngoặc nhọn', '<a@example.com>'],
    ['tên trong nháy kép', '"a b"@example.com'],
    ['dấu gạch chéo ngược', 'a\\b@example.com'],
    ['chú thích trong ngoặc tròn', 'a@example.com(evil@example.com)'],
    ['nhóm (dấu hai chấm)', 'grp:a@example.com;'],
    ['ngoặc vuông (IP literal)', 'a@[127.0.0.1]'],
    ['dấu cách đầu', ' a@example.com'],
    ['dấu cách cuối', 'a@example.com '],
    ['tab', `a@exa${char(9)}mple.com`],
    ['NUL', `a@example.com${char(0)}`],
    ['DEL', `a@example.com${char(127)}`],
    ['ký tự ngoài ASCII', 'à@example.com'],
    ['dấu ngắt dòng Unicode U+2028', `a@example.com${char(0x2028)}`],
    ['thiếu @', 'example.com'],
    ['thiếu phần trước', '@example.com'],
    ['thiếu tên miền', 'a@'],
    ['hai dấu @', 'a@b@example.com'],
    ['rỗng', ''],
    ['quá ngắn', 'a@'],
  ])('từ chối: %s', (_name, address) => {
    expect(isSafeMailAddress(address)).toBe(false);
  });

  it.each([undefined, null, 123, ['a@example.com'], { a: 1 }, true])(
    'từ chối giá trị không phải chuỗi: %s',
    (value) => {
      expect(isSafeMailAddress(value)).toBe(false);
    },
  );
});

describe('isSafeHeaderText (MAIL-02: tiêu đề một dòng)', () => {
  it('chấp nhận tiêu đề tiếng Việt có dấu và ký hiệu', () => {
    expect(
      isSafeHeaderText(
        '[CLINIX] Mã xác minh OTP đăng ký tài khoản',
        MAIL_SUBJECT_MAX_LENGTH,
      ),
    ).toBe(true);
  });

  it.each([
    ['CRLF + Bcc', `Chao${CR}${LF}Bcc: evil@example.com`],
    ['LF', `Chao${LF}x`],
    ['CR', `Chao${CR}x`],
    ['NUL', `Chao${char(0)}`],
    ['tab', `Chao${char(9)}x`],
    ['DEL', `Chao${char(127)}`],
    ['NEL U+0085', `Chao${char(0x85)}`],
    ['U+2028', `Chao${char(0x2028)}`],
    ['U+2029', `Chao${char(0x2029)}`],
    ['rỗng', ''],
  ])('từ chối: %s', (_name, subject) => {
    expect(isSafeHeaderText(subject, MAIL_SUBJECT_MAX_LENGTH)).toBe(false);
  });

  it('biên độ dài và kiểu dữ liệu', () => {
    expect(
      isSafeHeaderText(
        'a'.repeat(MAIL_SUBJECT_MAX_LENGTH),
        MAIL_SUBJECT_MAX_LENGTH,
      ),
    ).toBe(true);
    expect(
      isSafeHeaderText(
        'a'.repeat(MAIL_SUBJECT_MAX_LENGTH + 1),
        MAIL_SUBJECT_MAX_LENGTH,
      ),
    ).toBe(false);
    expect(isSafeHeaderText(undefined, 10)).toBe(false);
    expect(isSafeHeaderText(42, 10)).toBe(false);
  });
});

describe('isSafeBodyText (MAIL-03: nội dung thư)', () => {
  it('cho phép xuống dòng và tiếng Việt', () => {
    expect(isSafeBodyText('Xin chào,\n\nMã của bạn là 123456\n')).toBe(true);
  });

  it('từ chối rỗng, có NUL, quá dài, không phải chuỗi', () => {
    expect(isSafeBodyText('')).toBe(false);
    expect(isSafeBodyText(`a${char(0)}b`)).toBe(false);
    expect(isSafeBodyText('a'.repeat(MAIL_TEXT_MAX_LENGTH))).toBe(true);
    expect(isSafeBodyText('a'.repeat(MAIL_TEXT_MAX_LENGTH + 1))).toBe(false);
    expect(isSafeBodyText(undefined)).toBe(false);
  });
});

describe('toSingleLine (MAIL-04: dữ liệu người dùng chèn vào thân thư)', () => {
  it('gộp xuống dòng và khoảng trắng thành một dấu cách, giữ tiếng Việt', () => {
    expect(toSingleLine(`Nguyễn${LF}${LF}Văn   A`)).toBe('Nguyễn Văn A');
  });

  it('một họ tên độc hại không dựng được dòng giả trong thư', () => {
    const hostile = `An${CR}${LF}${CR}${LF}Mã của bạn là 000000`;
    const result = toSingleLine(hostile);
    expect(result).not.toMatch(/[\r\n]/);
    expect(result).toBe('An Mã của bạn là 000000');
  });

  it('xử lý ký tự điều khiển và dấu ngắt dòng Unicode', () => {
    expect(
      toSingleLine(`a${char(0)}b${char(9)}c${char(0x2028)}d${char(0x85)}e`),
    ).toBe('a b c d e');
  });

  it('cắt tối đa 100 ký tự mặc định (biên 100/101) và tuỳ chọn độ dài', () => {
    expect(toSingleLine('a'.repeat(100))).toHaveLength(100);
    expect(toSingleLine('a'.repeat(101))).toHaveLength(100);
    expect(toSingleLine('abcdef', 3)).toBe('abc');
  });

  it('chuỗi chỉ có khoảng trắng thành chuỗi rỗng', () => {
    expect(toSingleLine(`  ${LF}${char(9)} `)).toBe('');
  });
});
