import {
  EMAIL_MAX_LENGTH,
  isValidEmail,
  normalizeEmail,
} from './email-policy.js';

// Task A1. Test case: DK-04 (email sai định dạng / rỗng / > 255 / không ASCII), DK-17 (hoa-thường, khoảng trắng đầu cuối).
const accepted = (raw: string) => isValidEmail(normalizeEmail(raw));

// Email dài đúng `length` ký tự, hợp lệ về định dạng: phần trước @ 64 ký tự, tên miền gồm các nhãn ≤ 63 ký tự
function emailOfLength(length: number): string {
  const local = 'a'.repeat(64);
  const domainLength = length - local.length - 1; // trừ phần trước @ và dấu @
  const tail = '.com';
  const labels = [];
  let remaining = domainLength - tail.length;
  while (remaining > 0) {
    const size = Math.min(63, remaining - (remaining > 63 ? 1 : 0)); // chừa chỗ cho dấu chấm giữa các nhãn
    labels.push('b'.repeat(size));
    remaining -= size + 1;
  }
  return `${local}@${labels.join('.')}${tail}`;
}

describe('normalizeEmail (DK-17, S5)', () => {
  it('hạ chữ thường tên miền nhưng GIỮ NGUYÊN hoa/thường của phần trước @', () => {
    expect(normalizeEmail('Nguyen.Van@Example.COM')).toBe(
      'Nguyen.Van@example.com',
    );
    expect(normalizeEmail('NGUYEN@EXAMPLE.com')).toBe('NGUYEN@example.com');
  });

  it('cắt khoảng trắng ASCII hai đầu (dấu cách, tab, xuống dòng)', () => {
    expect(normalizeEmail('  a@b.com  ')).toBe('a@b.com');
    expect(normalizeEmail('\t\na@b.com\r\n')).toBe('a@b.com');
  });

  it('không cắt khoảng trắng Unicode (U+00A0) và không biến ký tự lạ thành ASCII', () => {
    expect(normalizeEmail('a@b.com ')).toBe('a@b.com ');
    // Ký hiệu Kelvin U+212A: toLowerCase() đổi thành "k" ASCII; ở đây phải giữ nguyên để bị từ chối
    expect(normalizeEmail('a@Kelvin.com')).toBe('a@Kelvin.com');
    expect(normalizeEmail('a@İstanbul.com')).toBe('a@İstanbul.com');
  });

  it('chuẩn hoá hai lần cho cùng kết quả; chuỗi không có @ chỉ bị cắt hai đầu', () => {
    const once = normalizeEmail(' A@B.Com ');
    expect(normalizeEmail(once)).toBe(once);
    expect(normalizeEmail(' abc ')).toBe('abc');
    expect(normalizeEmail('')).toBe('');
  });

  it('hai email chỉ khác hoa/thường tên miền và khoảng trắng chuẩn hoá về cùng một chuỗi', () => {
    expect(normalizeEmail(' user@Example.com')).toBe(
      normalizeEmail('user@EXAMPLE.COM '),
    );
  });
});

describe('isValidEmail (DK-04)', () => {
  it.each([
    'a@b.co',
    'nguyen.van@example.com',
    'Nguyen.Van+tag@Example.COM',
    'a_b-c@sub.example.co.uk',
    "o'brien@example.com",
    '  a@b.com  ', // khoảng trắng hai đầu được cắt trước khi kiểm
    'user@xn--bcher-kva.example', // tên miền dạng punycode (ASCII)
  ])('chấp nhận %j', (raw) => {
    expect(accepted(raw)).toBe(true);
  });

  it.each([
    ['rỗng', ''],
    ['chỉ khoảng trắng', '   '],
    ['không có @', 'abc.example.com'],
    ['thiếu phần trước @', '@example.com'],
    ['thiếu tên miền', 'a@'],
    ['tên miền không có TLD', 'a@localhost'],
    ['TLD một ký tự', 'a@b.c'],
    ['TLD toàn số', 'a@b.123'],
    ['hai dấu @', 'a@@b.com'],
    ['nhiều địa chỉ', 'a@b.com,c@d.com'],
    ['dấu cách bên trong', 'a b@c.com'],
    ['hai dấu chấm liền nhau', 'a..b@c.com'],
    ['dấu chấm đầu phần trước @', '.a@b.com'],
    ['dấu chấm cuối phần trước @', 'a.@b.com'],
    ['nhãn tên miền bắt đầu bằng gạch nối', 'a@-b.com'],
    ['hai dấu chấm trong tên miền', 'a@b..com'],
    ['tên miền có gạch dưới', 'a@b_c.com'],
    ['tên hiển thị', 'Nguyen <a@b.com>'],
    ['tên trong dấu nháy kép', '"ab"@example.com'],
    ['địa chỉ IP trong ngoặc vuông', 'a@[1.2.3.4]'],
    ['ký tự có dấu ở phần trước @', 'nguyễn@example.com'],
    ['ký tự có dấu ở tên miền', 'a@bücher.com'],
    ['emoji', 'a@b.com😀'],
    ['U+00A0 ở cuối (không được cắt)', 'a@b.com '],
    ['ký hiệu Kelvin trong tên miền', 'a@Kelvin.com'],
    ['ký tự điều khiển bên trong', 'a\u0007b@c.com'],
  ])('từ chối: %s', (_label, raw) => {
    expect(accepted(raw)).toBe(false);
  });

  it('biên độ dài tổng: 255 ký tự được, 256 ký tự bị từ chối', () => {
    expect(EMAIL_MAX_LENGTH).toBe(255);
    const longest = emailOfLength(255);
    expect(longest).toHaveLength(255);
    expect(accepted(longest)).toBe(true);
    const tooLong = emailOfLength(256);
    expect(tooLong).toHaveLength(256);
    expect(accepted(tooLong)).toBe(false);
  });

  it('phần trước @ dài 64 được, 65 bị từ chối', () => {
    expect(accepted(`${'a'.repeat(64)}@example.com`)).toBe(true);
    expect(accepted(`${'a'.repeat(65)}@example.com`)).toBe(false);
  });
});
