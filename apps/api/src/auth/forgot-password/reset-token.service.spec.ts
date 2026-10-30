import { SignJWT, UnsecuredJWT } from 'jose';
import {
  ACCESS_TOKEN_AUDIENCE,
  RESET_TOKEN_AUDIENCE,
  RESET_TOKEN_ISSUER,
  RESET_TOKEN_TTL_MS,
} from '../auth.constants.js';
import { createTestConfigService } from '../testing/auth-test-config.js';
import { TEST_AUTH_ENV } from '../testing/auth-test-env.js';
import { TokenService } from '../session/token.service.js';
import { ResetTokenService } from './reset-token.service.js';

// Task A11 — hợp đồng của resetToken (S2, N6; A12 dùng lại): khoá riêng, mục đích riêng, hạn 10 phút TÍNH TỪ LÚC XÁC MINH và nửa mở.
// Test case: QM-14 (access token ↔ resetToken, cả hai chiều), QM-11 phần cấp token (biên 10 phút), SE-06 (alg cố định, khoá riêng cho reset).
// Mã RT-nn là [đề xuất]. Khoá lấy từ TEST_AUTH_ENV, không viết chuỗi khoá trong file này.
const T0 = new Date('2026-10-27T01:00:00.000Z'); // 08:00:00 giờ Việt Nam
const TTL = RESET_TOKEN_TTL_MS / 1000;
const encode = (text: string) => new TextEncoder().encode(text);
const resetKey = encode(TEST_AUTH_ENV.JWT_RESET_SECRET);
const sec = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const ids = { taiKhoanId: '42', maXacThucId: '77' };

const service = new ResetTokenService(createTestConfigService());
const tokens = new TokenService(createTestConfigService());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

// resetToken hợp lệ về mọi mặt, trừ phần `tweak` do từng ca tự sửa
async function craft(
  tweak: {
    key?: Uint8Array;
    alg?: string;
    typ?: string;
    issuer?: string;
    audience?: string;
    subject?: string | null;
    claims?: Record<string, unknown>;
    iat?: number | null;
    exp?: number | null;
  } = {},
) {
  const iat = tweak.iat === undefined ? T0.getTime() / 1000 : tweak.iat;
  const exp = tweak.exp === undefined ? T0.getTime() / 1000 + TTL : tweak.exp;
  const jwt = new SignJWT({ mxt: '77', ...tweak.claims })
    .setProtectedHeader({ alg: tweak.alg ?? 'HS256', typ: tweak.typ ?? 'JWT' })
    .setIssuer(tweak.issuer ?? RESET_TOKEN_ISSUER)
    .setAudience(tweak.audience ?? RESET_TOKEN_AUDIENCE);
  if (tweak.subject !== null) jwt.setSubject(tweak.subject ?? '42');
  if (iat !== null) jwt.setIssuedAt(iat);
  if (exp !== null) jwt.setExpirationTime(exp);
  return jwt.sign(tweak.key ?? resetKey);
}

const payloadOf = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());

describe('ResetTokenService — ký và nội dung', () => {
  it('RT-01 ký rồi kiểm lại được: đúng tài khoản và mã xác thực; header và payload đúng thiết kế, không có dữ liệu nhạy cảm', async () => {
    const { token, expiresAt } = await service.sign({ ...ids, issuedAt: T0 });

    expect(await service.verify(token)).toEqual(ids);
    expect(expiresAt).toEqual(sec(TTL));
    expect(
      JSON.parse(
        Buffer.from(token.split('.')[0] ?? '', 'base64url').toString(),
      ),
    ).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payloadOf(token)).toEqual({
      sub: '42',
      mxt: '77',
      iss: RESET_TOKEN_ISSUER,
      aud: RESET_TOKEN_AUDIENCE,
      iat: T0.getTime() / 1000,
      exp: T0.getTime() / 1000 + 600,
    });
  });

  it('RT-02 hạn 10 phút (600 giây) tính từ `issuedAt` truyền vào, KHÔNG từ đồng hồ lúc ký và không từ lúc cấp OTP', async () => {
    vi.setSystemTime(sec(5000)); // đồng hồ lúc ký khác hẳn mốc xác minh
    const { token, expiresAt } = await service.sign({
      ...ids,
      issuedAt: sec(120),
    });
    expect(expiresAt).toEqual(sec(120 + 600));
    expect(payloadOf(token)['iat']).toBe(T0.getTime() / 1000 + 120);
    expect(payloadOf(token)['exp']).toBe(T0.getTime() / 1000 + 720);
  });

  it('RT-03 cắt phần lẻ giây của mốc xác minh (JWT chỉ có độ chính xác giây)', async () => {
    const { token, expiresAt } = await service.sign({
      ...ids,
      issuedAt: new Date(T0.getTime() + 999),
    });
    expect(payloadOf(token)['iat']).toBe(T0.getTime() / 1000);
    expect(expiresAt).toEqual(sec(TTL));
  });
});

describe('ResetTokenService — biên 10 phút, nửa mở (QM-11 phần cấp token)', () => {
  it.each([0, 1, 300, 598, 599])(
    'RT-04 sau %i giây kể từ lúc xác minh: còn hiệu lực',
    async (seconds) => {
      const { token } = await service.sign({ ...ids, issuedAt: T0 });
      expect(await service.verify(token, sec(seconds))).toEqual(ids);
    },
  );

  it.each([600, 601, 3600])(
    'RT-04 sau %i giây kể từ lúc xác minh: hết hạn (đúng 10:00:00 là hết)',
    async (seconds) => {
      const { token } = await service.sign({ ...ids, issuedAt: T0 });
      expect(await service.verify(token, sec(seconds))).toBeNull();
    },
  );

  it('RT-05 `verify` mặc định dùng đồng hồ ứng dụng (giả): 9:59 qua, 10:00:00 và 10:01 hết; phần lẻ giây cắt xuống như mọi mốc khác', async () => {
    const { token } = await service.sign({ ...ids, issuedAt: T0 });

    vi.setSystemTime(sec(599));
    expect(await service.verify(token)).toEqual(ids);
    vi.setSystemTime(new Date(T0.getTime() + 599_999));
    expect(await service.verify(token)).toEqual(ids);
    vi.setSystemTime(sec(600));
    expect(await service.verify(token)).toBeNull();
    vi.setSystemTime(sec(601));
    expect(await service.verify(token)).toBeNull();
  });

  it('RT-06 hạn tính từ lúc xác minh: OTP cấp lúc T, xác minh lúc T+500 s thì token sống tới T+1100 s (dài hơn hạn 10 phút của chính OTP, N6)', async () => {
    const verifiedAt = sec(500);
    const { token } = await service.sign({ ...ids, issuedAt: verifiedAt });
    expect(await service.verify(token, sec(500 + 599))).toEqual(ids);
    expect(await service.verify(token, sec(500 + 600))).toBeNull();
  });
});

describe('ResetTokenService — khoá và mục đích riêng (QM-14, SE-06)', () => {
  it('RT-07 QM-14 access token KHÔNG dùng làm resetToken', async () => {
    const { token } = await tokens.signAccessToken({
      accountId: '42',
      sessionId: '77',
      notAfter: sec(8 * 3600),
    });
    expect(await tokens.verifyAccessToken(token)).not.toBeNull();
    expect(await service.verify(token)).toBeNull();
  });

  it('RT-08 QM-14 resetToken KHÔNG dùng làm access token (chiều ngược lại)', async () => {
    const { token } = await service.sign({ ...ids, issuedAt: T0 });
    expect(await service.verify(token)).not.toBeNull();
    expect(await tokens.verifyAccessToken(token)).toBeNull();
  });

  it.each([
    ['JWT_ACCESS_SECRET', TEST_AUTH_ENV.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', TEST_AUTH_ENV.JWT_REFRESH_SECRET],
    ['OTP_HMAC_SECRET', TEST_AUTH_ENV.OTP_HMAC_SECRET],
  ])(
    'RT-09 token mang đủ claims của resetToken nhưng ký bằng %s → từ chối (khoá riêng)',
    async (_name, secret) => {
      expect(
        await service.verify(await craft({ key: encode(secret) })),
      ).toBeNull();
    },
  );

  it('RT-10 ký đúng khoá reset nhưng `aud` là của access token (hoặc thiếu mục đích) → từ chối; `iss` lạ → từ chối', async () => {
    expect(await service.verify(await craft())).toEqual(ids); // đối chứng: craft() mặc định hợp lệ
    expect(
      await service.verify(await craft({ audience: ACCESS_TOKEN_AUDIENCE })),
    ).toBeNull();
    expect(await service.verify(await craft({ audience: 'khac' }))).toBeNull();
    expect(await service.verify(await craft({ issuer: 'ai-do' }))).toBeNull();
  });

  it('RT-11 khoá đổi thì token cũ mất hiệu lực (hai instance hai khoá)', async () => {
    const other = new ResetTokenService(
      createTestConfigService({ JWT_RESET_SECRET: 'k'.repeat(40) }),
    );
    const { token } = await other.sign({ ...ids, issuedAt: T0 });
    expect(await other.verify(token)).toEqual(ids);
    expect(await service.verify(token)).toBeNull();
  });

  it('RT-12 alg cố định HS256: `alg: none` và HS384 (cùng khoá) bị từ chối', async () => {
    const unsigned = new UnsecuredJWT({ mxt: '77' })
      .setSubject('42')
      .setIssuer(RESET_TOKEN_ISSUER)
      .setAudience(RESET_TOKEN_AUDIENCE)
      .setIssuedAt(T0.getTime() / 1000)
      .setExpirationTime(T0.getTime() / 1000 + TTL)
      .encode();
    expect(await service.verify(unsigned)).toBeNull();
    expect(await service.verify(await craft({ alg: 'HS384' }))).toBeNull();
  });

  it('RT-13 header `typ` khác JWT → từ chối', async () => {
    expect(await service.verify(await craft({ typ: 'at+jwt' }))).toBeNull();
  });
});

describe('ResetTokenService — claims thiếu hoặc hỏng, token bị sửa', () => {
  it.each([
    ['sub', { subject: null }],
    ['mxt', { claims: { mxt: undefined } }],
    ['exp', { exp: null }],
    ['iat', { iat: null }],
  ])('RT-14 thiếu claim %s → từ chối', async (_name, tweak) => {
    expect(await service.verify(await craft(tweak))).toBeNull();
  });

  it.each([
    ['rỗng', ''],
    ['số 0', '0'],
    ['số 0 đứng đầu', '01'],
    ['số âm', '-1'],
    ['chữ', 'abc'],
    ['khoảng trắng', ' 42'],
    ['20 chữ số', '10000000000000000000'],
    ['vượt BIGINT', '9223372036854775808'],
  ])(
    'RT-15 `sub` không phải mã tài khoản hợp lệ (%s) → từ chối',
    async (_label, subject) => {
      expect(await service.verify(await craft({ subject }))).toBeNull();
    },
  );

  it.each([
    ['rỗng', ''],
    ['số 0', '0'],
    ['chữ', 'abc'],
    ['số JSON', 77],
    ['null', null],
    ['mảng', ['77']],
    ['vượt BIGINT', '9223372036854775808'],
  ])(
    'RT-16 `mxt` không phải mã xác thực hợp lệ (%s) → từ chối',
    async (_label, mxt) => {
      expect(await service.verify(await craft({ claims: { mxt } }))).toBeNull();
    },
  );

  it('RT-17 sửa `sub` hoặc `mxt` trong token đã ký (đổi tài khoản/mã xác thực) → chữ ký không còn khớp', async () => {
    const { token } = await service.sign({ ...ids, issuedAt: T0 });
    const [header, payload, signature] = token.split('.') as [
      string,
      string,
      string,
    ];
    for (const edit of [{ sub: '43' }, { mxt: '78' }, { exp: 9_999_999_999 }]) {
      const forged = Buffer.from(
        JSON.stringify({ ...payloadOf(token), ...edit }),
      ).toString('base64url');
      expect(forged).not.toBe(payload);
      expect(
        await service.verify(`${header}.${forged}.${signature}`),
      ).toBeNull();
    }
  });

  it.each(['', 'abc', 'a.b', 'a.b.c', '..', 'x'.repeat(5000)])(
    'RT-18 chuỗi không phải JWT (%#) → null, không ném lỗi',
    async (junk) => {
      expect(await service.verify(junk)).toBeNull();
    },
  );
});
