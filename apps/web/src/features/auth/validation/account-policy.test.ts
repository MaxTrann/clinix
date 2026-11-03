import {
  isPlausibleEmail,
  isValidFullName,
  isValidPhone,
  trimAsciiWhitespace,
} from './account-policy';

// Task F2. Mã ca VL-nn là [đề xuất]; ca nào phủ test case của PLAN thì ghi kèm mã đó.
describe('họ tên (A5-D)', () => {
  it.each(['Nguyễn Văn A', 'A', "O'Neil", 'Nguyễn'])(
    'VL-10 hợp lệ: %s',
    (name) => {
      expect(isValidFullName(name)).toBe(true);
    },
  );

  it.each([
    ['chỉ số', '12345'],
    ['chỉ dấu', "-'. ,"],
    ['tab', 'An\tBình'],
    ['đảo chiều chữ', 'An‮Bình'],
    ['rộng 0', 'An​Bình'],
    ['ngắt đoạn', 'An Bình'],
    ['dùng riêng', 'AnBình'],
    ['rỗng', ''],
  ])('VL-11 không hợp lệ: %s', (_name, value) => {
    expect(isValidFullName(value)).toBe(false);
  });

  it('VL-12 đếm theo điểm mã sau NFC, không theo đơn vị UTF-16', () => {
    expect(isValidFullName('a'.repeat(100))).toBe(true);
    expect(isValidFullName('a'.repeat(101))).toBe(false);
    // 100 chữ ngoài mặt phẳng cơ bản: `.length` là 200 nhưng vẫn là 100 ký tự
    expect(isValidFullName('\u{20000}'.repeat(100))).toBe(true);
    // Dạng tổ hợp dài hơn 100 đơn vị, sau NFC đúng 100 ký tự
    expect(isValidFullName('ê'.repeat(100))).toBe(true);
  });

  it('VL-13 khoảng trắng ASCII hai đầu không tính', () => {
    expect(isValidFullName(`  ${'a'.repeat(100)} \t`)).toBe(true);
  });
});

describe('DK-05 số điện thoại', () => {
  it.each(['0901234567', '090 123 4567', '090.123.4567', ' 0901234567 '])(
    'VL-20 hợp lệ: %s',
    (phone) => {
      expect(isValidPhone(phone)).toBe(true);
    },
  );

  it.each([
    '',
    '090123456',
    '09012345678',
    '1901234567',
    '+84901234567',
    '090-123-4567',
    '090  1234567',
    '٠901234567',
  ])('VL-21 không hợp lệ: %s', (phone) => {
    expect(isValidPhone(phone)).toBe(false);
  });
});

describe('DK-04 email', () => {
  it.each(['a@b.vn', ' a@b.vn ', "o'neil+1@example.com"])(
    'VL-30 hợp lệ: %s',
    (email) => {
      expect(isPlausibleEmail(email)).toBe(true);
    },
  );

  it('VL-31 biên độ dài: tổng 255, phần trước @ 64', () => {
    const domain = `${'d'.repeat(186)}.vn`;
    expect(domain.length + 66).toBe(255);
    expect(isPlausibleEmail(`${'a'.repeat(64)}@x${domain}`)).toBe(true);
    expect(isPlausibleEmail(`${'a'.repeat(64)}@xy${domain}`)).toBe(false);
    expect(isPlausibleEmail(`${'a'.repeat(65)}@b.vn`)).toBe(false);
  });

  it.each(['', 'abc', '@b.vn', 'a@b', 'a b@c.vn', 'nguyễn@b.vn', 'a"b@c.vn'])(
    'VL-32 không hợp lệ: %s',
    (email) => {
      expect(isPlausibleEmail(email)).toBe(false);
    },
  );
});

describe('trimAsciiWhitespace', () => {
  it('VL-40 giữ U+00A0, khác String.trim()', () => {
    expect(trimAsciiWhitespace(' \ta\n')).toBe('a');
    expect(trimAsciiWhitespace(' a')).toBe(' a');
  });
});
