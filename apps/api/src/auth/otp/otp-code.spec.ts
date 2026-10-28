import * as crypto from 'node:crypto';
import { vi } from 'vitest';
import {
  generateOtpCode,
  hashOtp,
  isOtpFormat,
  otpMatches,
  type OtpHashInput,
} from './otp-code.js';

// Task A2. Mã test case: ĐK b6 / QMK b5 (OTP 6 số ngẫu nhiên, lưu HMAC), S3, DK-01 (`ma_bam` là HMAC), DK-31 (mã của loại/tài khoản khác).
// Bọc `randomInt` và `timingSafeEqual` của node:crypto bằng hàm theo dõi nhưng vẫn gọi hàm thật, để kiểm HÀM CÓ ĐƯỢC GỌI và gọi với gì.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomInt: vi.fn(actual.randomInt),
    timingSafeEqual: vi.fn(actual.timingSafeEqual),
  };
});

const KEY = Buffer.from('khoa-hmac-thu-nghiem-khong-phai-bi-mat-0123');
const BASE: OtpHashInput = {
  taiKhoanId: '7',
  loai: 'DangKy',
  maXacThucId: '42',
  code: '482913',
};

beforeEach(() => {
  vi.mocked(crypto.randomInt).mockClear();
  vi.mocked(crypto.timingSafeEqual).mockClear();
});

describe('generateOtpCode (OTP-01: mã 6 chữ số sinh bằng randomInt)', () => {
  it('gọi randomInt(0, 1_000_000) và đệm 0 ở đầu cho đủ 6 chữ số', () => {
    for (const [raw, expected] of [
      [0, '000000'],
      [42, '000042'],
      [100_000, '100000'],
      [999_999, '999999'],
    ] as const) {
      vi.mocked(crypto.randomInt).mockReturnValueOnce(raw as never);
      expect(generateOtpCode()).toBe(expected);
    }
    expect(crypto.randomInt).toHaveBeenCalledWith(0, 1_000_000);
  });

  it('mã thật sinh ra luôn đúng 6 chữ số ASCII, có mã bắt đầu bằng 0 và các mã không giống hệt nhau', () => {
    const codes = Array.from({ length: 20_000 }, () => generateOtpCode());
    expect(codes.every((code) => /^[0-9]{6}$/.test(code))).toBe(true);
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(15_000);
  });
});

describe('isOtpFormat (OTP-02)', () => {
  it('chỉ nhận đúng 6 chữ số ASCII', () => {
    expect(isOtpFormat('123456')).toBe(true);
    expect(isOtpFormat('000000')).toBe(true);
    for (const bad of [
      '',
      '12345',
      '1234567',
      'abcdef',
      '12345a',
      ' 123456',
      '123456 ',
      '123456\n',
      '١٢٣٤٥٦',
    ]) {
      expect(isOtpFormat(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('hashOtp (OTP-03: HMAC-SHA-256 gồm tai_khoan_id | loai | ma_xac_thuc_id | mã)', () => {
  it('là hex 64 ký tự và xác định (cùng đầu vào, cùng băm)', () => {
    const hash = hashOtp(KEY, BASE);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOtp(KEY, { ...BASE })).toBe(hash);
  });

  it.each<[string, Partial<OtpHashInput>]>([
    ['mã tài khoản', { taiKhoanId: '8' }],
    ['loại', { loai: 'QuenMatKhau' }],
    ['mã lần gửi (ma_xac_thuc_id)', { maXacThucId: '43' }],
    ['mã OTP', { code: '482914' }],
  ])('đổi %s thì băm đổi', (_name, change) => {
    expect(hashOtp(KEY, { ...BASE, ...change })).not.toBe(hashOtp(KEY, BASE));
  });

  it('đổi khoá thì băm đổi (không phải SHA-256 trơn)', () => {
    expect(
      hashOtp(Buffer.from('khoa-khac-0123456789abcdef-0123456789'), BASE),
    ).not.toBe(hashOtp(KEY, BASE));
  });

  it('ranh giới trường rõ ràng: dời chữ số từ mã lần gửi sang mã OTP cho băm khác', () => {
    expect(
      hashOtp(KEY, { ...BASE, maXacThucId: '23', code: '456789' }),
    ).not.toBe(hashOtp(KEY, { ...BASE, maXacThucId: '2', code: '3456789' }));
  });
});

describe('otpMatches (OTP-04: so bằng timingSafeEqual trên hai buffer cùng độ dài)', () => {
  const stored = hashOtp(KEY, BASE);

  it('đúng mã thì khớp; sai một chữ số thì không', () => {
    expect(otpMatches(stored, KEY, BASE)).toBe(true);
    expect(otpMatches(stored, KEY, { ...BASE, code: '482914' })).toBe(false);
  });

  it('băm của hàng này KHÔNG dùng được cho hàng khác dù trùng mã (DK-31: khác loại, khác tài khoản, khác lần gửi)', () => {
    expect(otpMatches(stored, KEY, { ...BASE, maXacThucId: '43' })).toBe(false);
    expect(otpMatches(stored, KEY, { ...BASE, loai: 'QuenMatKhau' })).toBe(
      false,
    );
    expect(otpMatches(stored, KEY, { ...BASE, taiKhoanId: '8' })).toBe(false);
  });

  it('sai khoá thì không khớp', () => {
    expect(
      otpMatches(
        stored,
        Buffer.from('khoa-khac-0123456789abcdef-0123456789'),
        BASE,
      ),
    ).toBe(false);
  });

  it('dùng crypto.timingSafeEqual đúng MỘT lần với hai buffer 32 byte (không so bằng ===)', () => {
    otpMatches(stored, KEY, BASE);
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
    const [a, b] = vi.mocked(crypto.timingSafeEqual).mock.calls[0] ?? [];
    expect(Buffer.isBuffer(a)).toBe(true);
    expect(Buffer.isBuffer(b)).toBe(true);
    expect((a as Buffer).length).toBe(32);
    expect((b as Buffer).length).toBe(32);
  });

  it('cũng gọi timingSafeEqual khi mã sai (không có đường tắt nhanh cho mã sai)', () => {
    otpMatches(stored, KEY, { ...BASE, code: '000000' });
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rỗng', ''],
    ['giá trị tạm lúc chèn hàng', 'cho-dat-hmac'],
    ['hex ngắn 63 ký tự', stored.slice(0, 63)],
    ['hex dài 66 ký tự', `${stored}ab`],
    ['64 ký tự không phải hex', 'z'.repeat(64)],
    ['hex viết hoa', stored.toUpperCase()],
  ])(
    'băm lưu khác độ dài hoặc hỏng (%s): trả false, KHÔNG ném lỗi, không gọi timingSafeEqual, không lộ gì',
    (_name, broken) => {
      expect(() => otpMatches(broken, KEY, BASE)).not.toThrow();
      expect(otpMatches(broken, KEY, BASE)).toBe(false);
      expect(crypto.timingSafeEqual).not.toHaveBeenCalled();
    },
  );
});
