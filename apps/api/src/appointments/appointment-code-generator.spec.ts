import { randomInt } from 'node:crypto';
import { vi } from 'vitest';
import {
  APPOINTMENT_CODE_PATTERN,
  APPOINTMENT_CODE_SUFFIX_LENGTH,
  generateAppointmentCode,
  randomCodeSuffix,
} from './appointment-code.js';

// Task B8 — TAO-01 [đề xuất] (PLAN booking 7.1 DL-22 phần đơn vị, 5.11, Q13; TRACKING 3.21 B8-D): bộ sinh mã lịch hẹn `CLX-yyyyMMdd-XXXXX`. Hàm thuần nhận bộ sinh phần đuôi nên test ép được mọi kết quả;
// `crypto.randomInt` được bọc bằng `vi.fn` (mặc định gọi hàm thật) để kiểm "chọn đều trong 32 ký tự" mà không phụ thuộc xác suất.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomInt: vi.fn((max: number) => actual.randomInt(max)),
  };
});

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const FIXED_SUFFIX = () => 'ABCDE';

describe('TAO-01 generateAppointmentCode: dạng và ngày', () => {
  it('đúng dạng CLX-yyyyMMdd-XXXXX và dùng đúng phần đuôi của bộ sinh truyền vào, gọi một lần với độ dài 5', () => {
    const random = vi.fn(FIXED_SUFFIX);

    const code = generateAppointmentCode(
      new Date('2026-11-10T01:00:00Z'),
      random,
    );

    expect(code).toBe('CLX-20261110-ABCDE');
    expect(code).toMatch(APPOINTMENT_CODE_PATTERN);
    expect(random).toHaveBeenCalledExactlyOnceWith(
      APPOINTMENT_CODE_SUFFIX_LENGTH,
    );
    expect(APPOINTMENT_CODE_SUFFIX_LENGTH).toBe(5);
  });

  it.each([
    [
      '16:59:59.999 UTC vẫn là ngày D ở Việt Nam',
      '2026-11-10T16:59:59.999Z',
      '20261110',
    ],
    [
      '17:00:00 UTC đã là ngày D+1 ở Việt Nam (không phải ngày UTC)',
      '2026-11-10T17:00:00.000Z',
      '20261111',
    ],
    [
      'qua năm: 31/12 17:00 UTC là 01/01 năm sau',
      '2026-12-31T17:00:00.000Z',
      '20270101',
    ],
    [
      '00:00 giờ Việt Nam (17:00 UTC ngày trước) là ngày D',
      '2026-11-09T17:00:00.000Z',
      '20261110',
    ],
  ])('ngày theo giờ Việt Nam: %s', (_name, instant, day) => {
    expect(generateAppointmentCode(new Date(instant), FIXED_SUFFIX)).toBe(
      `CLX-${day}-ABCDE`,
    );
  });

  it('không đổi `now` truyền vào', () => {
    const now = new Date('2026-11-10T01:00:00.789Z');

    generateAppointmentCode(now, FIXED_SUFFIX);

    expect(now.toISOString()).toBe('2026-11-10T01:00:00.789Z');
  });
});

describe('TAO-01 generateAppointmentCode: bộ sinh sai bị từ chối', () => {
  it.each([
    ['chứa I', () => 'ABCDI'],
    ['chứa L', () => 'ABCDL'],
    ['chứa O', () => 'ABCDO'],
    ['chứa U', () => 'ABCDU'],
    ['chữ thường', () => 'abcde'],
    ['thiếu một ký tự', () => 'ABCD'],
    ['thừa một ký tự', () => 'ABCDEF'],
    ['rỗng', () => ''],
    ['có dấu gạch (tiêm thêm phần mã)', () => 'AB-DE'],
  ])('%s ⇒ ném RangeError, không trả mã hỏng', (_name, random) => {
    expect(() =>
      generateAppointmentCode(new Date('2026-11-10T01:00:00Z'), random),
    ).toThrow(RangeError);
  });
});

describe('TAO-01 randomCodeSuffix: bảng Crockford 32 ký tự từ crypto.randomInt', () => {
  afterEach(async () => {
    // Trả `randomInt` về hàm thật cho ca sau
    const actual =
      await vi.importActual<typeof import('node:crypto')>('node:crypto');
    vi.mocked(randomInt).mockImplementation((max: number) =>
      actual.randomInt(max),
    );
  });

  it('chỉ số 0…31 cho ra đúng bảng, theo thứ tự, và mỗi lần chọn gọi randomInt(32): không lệch, không bỏ ký tự', () => {
    let next = 0;
    vi.mocked(randomInt).mockImplementation(() => next++);

    const text = randomCodeSuffix(32);

    expect(text).toBe(ALPHABET);
    expect(vi.mocked(randomInt).mock.calls).toHaveLength(32);
    expect(vi.mocked(randomInt).mock.calls.every(([max]) => max === 32)).toBe(
      true,
    );
  });

  it('bảng khớp với lớp ký tự của APPOINTMENT_CODE_PATTERN: cả 32 ký tự đều qua mẫu, và không ký tự I, L, O, U', () => {
    for (const letter of ALPHABET)
      expect(`CLX-20261110-AAAA${letter}`).toMatch(APPOINTMENT_CODE_PATTERN);
    expect(ALPHABET).toHaveLength(32);
    expect(ALPHABET).not.toMatch(/[ILOU]/);
    // mọi chữ hoa và chữ số còn lại đều có mặt (36 ký tự trừ bốn ký tự cấm)
    expect(
      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        .split('')
        .filter((c) => !'ILOU'.includes(c))
        .join(''),
    ).toBe(ALPHABET);
  });

  it('10.000 phần đuôi thật: mọi mã khớp mẫu, độ dài đúng, và đủ đa dạng (không phải hằng)', () => {
    const codes = Array.from({ length: 10_000 }, () =>
      generateAppointmentCode(
        new Date('2026-11-10T01:00:00Z'),
        randomCodeSuffix,
      ),
    );

    expect(codes.every((code) => APPOINTMENT_CODE_PATTERN.test(code))).toBe(
      true,
    );
    expect(codes.every((code) => code.length === 18)).toBe(true);
    // 32^5 ≈ 33,5 triệu: 10.000 mã gần như không trùng (trùng nhiều là bộ sinh hỏng)
    expect(new Set(codes).size).toBeGreaterThan(9_900);
  });

  it('randomCodeSuffix(n) trả đúng n ký tự', () => {
    expect(randomCodeSuffix(0)).toBe('');
    expect(randomCodeSuffix(7)).toHaveLength(7);
  });
});
