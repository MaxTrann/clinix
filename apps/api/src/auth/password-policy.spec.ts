import { readFileSync } from 'node:fs';
import {
  PASSWORD_ISSUES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_SPECIAL_CHARACTERS,
  checkPassword,
} from './password-policy.js';

// Task A1. Test case: DK-06, SE-08 (nửa BE; frontend chạy cùng file vector ở F2), DM-04 và QM-08 (cùng quy tắc Q11).
interface Vector {
  input: string;
  expected: string;
  note: string;
}
const vectors = JSON.parse(
  readFileSync(
    new URL('./password-policy.vectors.json', import.meta.url),
    'utf8',
  ),
) as Vector[];

describe('checkPassword — bộ vector dùng chung FE/BE (SE-08, DK-06)', () => {
  it('file vector không rỗng và chỉ chứa kết quả mong đợi hợp lệ', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(60);
    for (const vector of vectors) {
      expect(['OK', ...Object.values(PASSWORD_ISSUES)], vector.note).toContain(
        vector.expected,
      );
    }
  });

  it.each(vectors.map((vector) => [vector.note, vector] as const))(
    '%s',
    (_note, vector) => {
      expect(checkPassword(vector.input) ?? 'OK').toBe(vector.expected);
    },
  );
});

describe('checkPassword — biên và thứ tự ưu tiên (DK-06)', () => {
  const withLength = (length: number) => `${'a'.repeat(length - 2)}1!`;

  it('biên độ dài 7 / 8 / 64 / 65', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(64);
    expect(checkPassword(withLength(7))).toBe(PASSWORD_ISSUES.INVALID);
    expect(checkPassword(withLength(8))).toBeNull();
    expect(checkPassword(withLength(64))).toBeNull();
    expect(checkPassword(withLength(65))).toBe(PASSWORD_ISSUES.INVALID);
  });

  it('hằng ký tự đặc biệt đúng 32 ký tự và đúng bằng tập dấu câu/ký hiệu của bảng ASCII in được', () => {
    // Dựng tập kỳ vọng độc lập từ bảng mã để bắt lỗi gõ nhầm trong hằng
    const expected = [];
    for (let code = 0x21; code <= 0x7e; code++) {
      const char = String.fromCharCode(code);
      if (!/[A-Za-z0-9]/.test(char)) expected.push(char);
    }
    expect(expected).toHaveLength(32);
    expect(PASSWORD_SPECIAL_CHARACTERS.split('').sort()).toEqual(
      expected.sort(),
    );
  });

  it('mỗi ký tự trong 32 ký tự đặc biệt đủ để đạt yêu cầu "ký tự đặc biệt"', () => {
    for (const char of PASSWORD_SPECIAL_CHARACTERS.split('')) {
      expect(checkPassword(`Matkhau1${char}`), `ký tự ${char}`).toBeNull();
    }
  });

  it('chữ cái, chữ số và dấu cách KHÔNG được tính là ký tự đặc biệt', () => {
    for (const char of 'abcXYZ019 '.split('')) {
      expect(checkPassword(`Matkhau1${char}`), `ký tự "${char}"`).toBe(
        PASSWORD_ISSUES.INVALID,
      );
    }
  });

  it('không trim và không chuẩn hoá: dấu cách hai đầu giữ nguyên và tính vào độ dài', () => {
    expect(checkPassword('  1!    ')).toBeNull(); // 8 ký tự, trong đó 6 dấu cách
    expect(checkPassword('1!     ')).toBe(PASSWORD_ISSUES.INVALID); // 7 ký tự: nếu bị trim còn ít hơn nữa
  });

  it('ký tự không hợp lệ được báo trước độ dài / chữ số / ký tự đặc biệt', () => {
    expect(checkPassword('é')).toBe(PASSWORD_ISSUES.INVALID_CHARACTERS);
    expect(checkPassword('Ab1!é')).toBe(PASSWORD_ISSUES.INVALID_CHARACTERS);
    expect(checkPassword('😀')).toBe(PASSWORD_ISSUES.INVALID_CHARACTERS);
    expect(checkPassword('a'.repeat(100) + '\t')).toBe(
      PASSWORD_ISSUES.INVALID_CHARACTERS,
    );
  });

  it('chuỗi cực dài vẫn được trả lời nhanh bằng mã lỗi, không ném lỗi', () => {
    const huge = 'a'.repeat(1_000_000);
    const started = Date.now();
    expect(checkPassword(huge)).toBe(PASSWORD_ISSUES.INVALID);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
