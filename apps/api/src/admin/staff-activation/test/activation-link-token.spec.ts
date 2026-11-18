import { createHash } from 'node:crypto';
import * as nodeCrypto from 'node:crypto';
import { vi } from 'vitest';
import {
  activationTokenMatches,
  buildActivationUrl,
  generateActivationToken,
  hashActivationToken,
} from '../activation-link-token.js';

// Task B14 (admin) — sinh, băm, so khớp token và dựng URL kích hoạt (NS-41, Q25). Mã NSB14-nn là [đề xuất].
// Bọc randomBytes và timingSafeEqual bằng spy (vẫn chạy hàm thật) để kiểm "đúng 32 byte" và "so sánh hằng định".
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomBytes: vi.fn(actual.randomBytes),
    timingSafeEqual: vi.fn(actual.timingSafeEqual),
  };
});

// Token cố định đúng dạng (43 ký tự) cho các ca cần biết trước từng ký tự
const KNOWN = 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
const BASE64URL =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

describe('generateActivationToken', () => {
  it('NSB14-01 (NS-41) 43 ký tự base64url, giải mã đúng 32 byte, gọi randomBytes(32), 1000 lần không trùng', () => {
    const token = generateActivationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(nodeCrypto.randomBytes).toHaveBeenLastCalledWith(32);

    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateActivationToken());
    expect(seen.size).toBe(1000);
  });
});

describe('hashActivationToken', () => {
  it('NSB14-02 (NS-41) SHA-256 hex 64 ký tự: đúng vector chuẩn của "abc" và đúng createHash độc lập', () => {
    expect(hashActivationToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const token = generateActivationToken();
    const hash = hashActivationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hash).not.toContain(token);
    expect(hashActivationToken(KNOWN)).not.toBe(hash);
  });

  it('NSB14-02 băm CHUỖI token chứ không băm byte đã giải mã: hai chuỗi khác ký tự cuối cùng giải mã ra cùng byte vẫn cho hai băm khác nhau', () => {
    const token = generateActivationToken();
    // Ký tự cuối (vị trí 42) mang 4 bit dữ liệu và 2 bit thừa; đặt bit thừa cuối lên 1 thì được một chuỗi khác cho cùng 32 byte
    const lastIndex = BASE64URL.indexOf(token.charAt(42));
    const alternative = `${token.slice(0, 42)}${BASE64URL.charAt(lastIndex | 1)}`;
    const canonical = `${token.slice(0, 42)}${BASE64URL.charAt(lastIndex & ~1)}`;
    expect(alternative).not.toBe(canonical);
    // Điều kiện của ca: Node thật sự coi hai chuỗi là cùng byte (nếu không thì ca này không chứng minh được gì)
    expect(
      Buffer.from(alternative, 'base64url').equals(
        Buffer.from(canonical, 'base64url'),
      ),
    ).toBe(true);
    expect(hashActivationToken(alternative)).not.toBe(
      hashActivationToken(canonical),
    );
    // Băm lưu của dạng chuẩn KHÔNG khớp dạng biến thể: mỗi token chỉ có một dạng hợp lệ
    expect(
      activationTokenMatches(hashActivationToken(canonical), alternative),
    ).toBe(false);
    expect(
      activationTokenMatches(hashActivationToken(canonical), canonical),
    ).toBe(true);
  });
});

describe('activationTokenMatches', () => {
  const stored = hashActivationToken(KNOWN);

  it('NSB14-03 (NS-41) đúng ⇒ true và gọi timingSafeEqual ĐÚNG MỘT lần với hai buffer 32 byte', () => {
    vi.mocked(nodeCrypto.timingSafeEqual).mockClear();
    expect(activationTokenMatches(stored, KNOWN)).toBe(true);
    expect(nodeCrypto.timingSafeEqual).toHaveBeenCalledTimes(1);
    const [left, right] = vi.mocked(nodeCrypto.timingSafeEqual).mock
      .calls[0] as [Buffer, Buffer];
    expect(left).toHaveLength(32);
    expect(right).toHaveLength(32);
  });

  it.each([
    ['sai một ký tự', `${KNOWN.slice(0, 42)}F`],
    ['hoa/thường khác', KNOWN.toLowerCase()],
    ['ngắn hơn 1 ký tự', KNOWN.slice(0, 42)],
    ['dài hơn 1 ký tự', `${KNOWN}A`],
    ['rỗng', ''],
    ['có ký tự ngoài bảng base64url', `${KNOWN.slice(0, 42)}+`],
    ['có khoảng trắng ở đầu', ` ${KNOWN.slice(1)}`],
    ['có xuống dòng ở cuối', `${KNOWN.slice(0, 42)}\n`],
    ['có ký tự không phải ASCII', `${KNOWN.slice(0, 42)}ạ`],
  ])('NSB14-03 token %s ⇒ false, không ném', (_name, presented) => {
    expect(() => activationTokenMatches(stored, presented)).not.toThrow();
    expect(activationTokenMatches(stored, presented)).toBe(false);
  });

  it.each([
    ['rỗng', ''],
    ['không phải hex', 'zz'],
    ['hex 63 ký tự', stored.slice(0, 63)],
    ['hex 65 ký tự', `${stored}0`],
    ['hex viết HOA', stored.toUpperCase()],
    ['giá trị tạm kiểu OTP', 'cho-dat-hmac'],
  ])(
    'NSB14-03 băm lưu hỏng (%s) ⇒ false, không ném (không lộ độ dài)',
    (_name, broken) => {
      expect(() => activationTokenMatches(broken, KNOWN)).not.toThrow();
      expect(activationTokenMatches(broken, KNOWN)).toBe(false);
    },
  );
});

describe('buildActivationUrl', () => {
  const token = generateActivationToken();

  it('NSB14-04 (Q25) WEB_ORIGIN + /kich-hoat + fragment #id=…&token=…, không có query', () => {
    const url = buildActivationUrl(
      'https://clinix.example.test:8443',
      '17',
      token,
    );
    expect(url).toBe(
      `https://clinix.example.test:8443/kich-hoat#id=17&token=${token}`,
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/kich-hoat');
    expect(parsed.search).toBe('');
    expect(parsed.hash).toBe(`#id=17&token=${token}`);
    expect(url).not.toContain('?');
  });

  it.each(['', '0', '01', 'abc', '1.5', '-1', '1'.repeat(20)])(
    'NSB14-04 id %j sai dạng ⇒ ném (lỗi lập trình, không gửi liên kết hỏng)',
    (id) => {
      expect(() =>
        buildActivationUrl('http://localhost:5173', id, token),
      ).toThrow();
    },
  );

  it.each([
    ['rỗng', ''],
    ['42 ký tự', token.slice(1)],
    ['44 ký tự', `${token}A`],
    ['có dấu +', `${token.slice(0, 42)}+`],
  ])('NSB14-04 token %s ⇒ ném', (_name, bad) => {
    expect(() =>
      buildActivationUrl('http://localhost:5173', '17', bad),
    ).toThrow();
  });
});
