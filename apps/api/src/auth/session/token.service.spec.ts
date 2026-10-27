import { SignJWT, UnsecuredJWT, base64url } from 'jose';
import { createHash } from 'node:crypto';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  SESSION_MAX_MS,
} from '../auth.constants.js';
import { TEST_AUTH_ENV } from '../testing/auth-test-env.js';
import { createTestConfigService } from '../testing/auth-test-config.js';
import { TokenService } from './token.service.js';

// Task A3. Test case: DN-25 (token sai chữ ký / alg none / hết hạn), DN-29 (định dạng refresh token, băm SHA-256),
// DN-31 (refresh token sai chữ ký hoặc sid bị sửa), SE-06 (alg cố định, khoá riêng cho access và refresh),
// H14 (access token không sống quá trần 8 giờ).
const T0 = new Date('2026-10-27T01:00:00.000Z'); // 08:00:00 giờ Việt Nam
const accessKey = new TextEncoder().encode(TEST_AUTH_ENV.JWT_ACCESS_SECRET);
const refreshKey = new TextEncoder().encode(TEST_AUTH_ENV.JWT_REFRESH_SECRET);

const service = new TokenService(createTestConfigService());
const sec = (ms: number) => new Date(T0.getTime() + ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

// JWT hợp lệ về mọi mặt, trừ phần `tweak` do từng ca tự sửa
async function craftAccessToken(
  tweak: {
    key?: Uint8Array;
    alg?: string;
    issuer?: string;
    audience?: string;
    claims?: Record<string, unknown>;
    typ?: string;
    exp?: number;
  } = {},
) {
  return new SignJWT({ sid: '77', ...tweak.claims })
    .setProtectedHeader({ alg: tweak.alg ?? 'HS256', typ: tweak.typ ?? 'JWT' })
    .setSubject('42')
    .setIssuer(tweak.issuer ?? ACCESS_TOKEN_ISSUER)
    .setAudience(tweak.audience ?? ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt(T0)
    .setExpirationTime(tweak.exp ?? Math.floor(T0.getTime() / 1000) + 900)
    .sign(tweak.key ?? accessKey);
}

describe('TokenService — access token (DN-25, SE-06, H14)', () => {
  it('ký rồi kiểm lại được: mang đúng mã tài khoản và mã phiên, sống 15 phút', async () => {
    const { token, expiresAt } = await service.signAccessToken({
      accountId: '42',
      sessionId: '77',
      notAfter: sec(SESSION_MAX_MS),
    });
    expect(expiresAt).toEqual(sec(15 * 60 * 1000));
    expect(await service.verifyAccessToken(token)).toEqual({
      accountId: '42',
      sessionId: '77',
    });
    // Header và payload đúng thiết kế (không có vai trò, không có dữ liệu nhạy cảm)
    const [header, payload] = token
      .split('.')
      .slice(0, 2) // phần thứ ba là chữ ký nhị phân, không phải JSON
      .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()));
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(Object.keys(payload).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'iss',
      'sid',
      'sub',
    ]);
  });

  it('H14: không sống quá notAfter (trần 8 giờ): cấp lúc 7:59 thì chỉ còn 1 phút', async () => {
    const { token, expiresAt } = await service.signAccessToken({
      accountId: '42',
      sessionId: '77',
      notAfter: sec(60 * 1000),
    });
    expect(expiresAt).toEqual(sec(60 * 1000));
    vi.setSystemTime(sec(59 * 1000));
    expect(await service.verifyAccessToken(token)).not.toBeNull();
    vi.setSystemTime(sec(60 * 1000)); // đúng mốc hết hạn thì đã hết hạn
    expect(await service.verifyAccessToken(token)).toBeNull();
  });

  it('notAfter còn xa thì lấy 15 phút; phần lẻ giây bị cắt xuống, không làm tròn lên', async () => {
    vi.setSystemTime(sec(900)); // bây giờ = T0 + 0,9 giây
    const { token, expiresAt } = await service.signAccessToken({
      accountId: '42',
      sessionId: '77',
      notAfter: sec(60 * 60 * 1000),
    });
    expect(expiresAt).toEqual(sec(900 * 1000)); // T0 + 900,9 giây → cắt còn T0 + 900 giây
    const [, payload] = token.split('.') as [string, string];
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString()).exp).toBe(
      Math.floor(T0.getTime() / 1000) + 900,
    );
  });

  it('hết hạn: còn dùng ở giây 899, hết ở giây 900 (DN-25)', async () => {
    const token = await craftAccessToken();
    vi.setSystemTime(sec(899 * 1000));
    expect(await service.verifyAccessToken(token)).not.toBeNull();
    vi.setSystemTime(sec(900 * 1000));
    expect(await service.verifyAccessToken(token)).toBeNull();
    vi.setSystemTime(sec(901 * 1000));
    expect(await service.verifyAccessToken(token)).toBeNull();
  });

  it('từ chối alg: none (DN-25, SE-06)', async () => {
    const unsigned = new UnsecuredJWT({ sid: '77' })
      .setSubject('42')
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(T0)
      .setExpirationTime(Math.floor(T0.getTime() / 1000) + 900)
      .encode();
    expect(unsigned.endsWith('.')).toBe(true); // đúng dạng không chữ ký
    expect(await service.verifyAccessToken(unsigned)).toBeNull();
  });

  it('từ chối thuật toán khác HS256 dù ký bằng đúng khoá (HS384, HS512)', async () => {
    for (const alg of ['HS384', 'HS512']) {
      expect(
        await service.verifyAccessToken(await craftAccessToken({ alg })),
        alg,
      ).toBeNull();
    }
  });

  it('từ chối token ký bằng khoá khác: khoá refresh, khoá lạ (DN-25, SE-06)', async () => {
    expect(
      await service.verifyAccessToken(
        await craftAccessToken({ key: refreshKey }),
      ),
    ).toBeNull();
    expect(
      await service.verifyAccessToken(
        await craftAccessToken({
          key: new TextEncoder().encode('z'.repeat(40)),
        }),
      ),
    ).toBeNull();
    // Dịch vụ khác cấu hình (khoá access khác) cũng không nhận token của dịch vụ này
    const other = new TokenService(
      createTestConfigService({ JWT_ACCESS_SECRET: 'y'.repeat(40) }),
    );
    expect(await other.verifyAccessToken(await craftAccessToken())).toBeNull();
  });

  it('từ chối payload bị sửa mà không ký lại (đổi sid, đổi sub)', async () => {
    const token = await craftAccessToken();
    const [header, payload, signature] = token.split('.') as [
      string,
      string,
      string,
    ];
    for (const change of [{ sid: '78' }, { sub: '43' }]) {
      const forged = JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString()),
        ...change,
      });
      const tampered = `${header}.${base64url.encode(forged)}.${signature}`;
      expect(
        await service.verifyAccessToken(tampered),
        JSON.stringify(change),
      ).toBeNull();
    }
  });

  it('từ chối sai issuer, sai audience, sai typ (không dùng chéo với loại token khác)', async () => {
    expect(
      await service.verifyAccessToken(
        await craftAccessToken({ issuer: 'ai-do-khac' }),
      ),
    ).toBeNull();
    expect(
      await service.verifyAccessToken(
        await craftAccessToken({ audience: 'clinix-reset' }),
      ),
    ).toBeNull();
    expect(
      await service.verifyAccessToken(
        await craftAccessToken({ typ: 'at+jwt' }),
      ),
    ).toBeNull();
  });

  it('từ chối claims thiếu hoặc hỏng: thiếu sid, sid/sub không phải số hợp lệ', async () => {
    expect(
      await service.verifyAccessToken(
        await craftAccessToken({ claims: { sid: undefined } }),
      ),
    ).toBeNull();
    for (const sid of ['abc', '0', '007', '-1', '1.5', '9'.repeat(25), 77]) {
      expect(
        await service.verifyAccessToken(
          await craftAccessToken({ claims: { sid } }),
        ),
        String(sid),
      ).toBeNull();
    }
    const badSub = await new SignJWT({ sid: '77' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('admin')
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(T0)
      .setExpirationTime(Math.floor(T0.getTime() / 1000) + 900)
      .sign(accessKey);
    expect(await service.verifyAccessToken(badSub)).toBeNull();
  });

  it('từ chối chuỗi không phải JWT mà không ném lỗi', async () => {
    for (const junk of [
      '',
      'abc',
      'a.b',
      'a.b.c',
      '....',
      'Bearer abc.def.ghi',
      'x'.repeat(5000),
    ]) {
      expect(
        await service.verifyAccessToken(junk),
        junk.slice(0, 20),
      ).toBeNull();
    }
  });
});

describe('TokenService — refresh token (DN-29, DN-31)', () => {
  const format = /^[1-9][0-9]*\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;

  it('định dạng sid.ngẫu nhiên.chữ ký; hash là SHA-256 hex của CẢ chuỗi token (DN-29)', () => {
    const { token, hash } = service.issueRefreshToken('123');
    expect(token).toMatch(format);
    expect(token.startsWith('123.')).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hash).not.toContain(token);
  });

  it('mỗi lần phát hành cho token và hash khác nhau (256 bit ngẫu nhiên)', () => {
    const issued = Array.from({ length: 50 }, () =>
      service.issueRefreshToken('123'),
    );
    expect(new Set(issued.map((i) => i.token)).size).toBe(50);
    expect(new Set(issued.map((i) => i.hash)).size).toBe(50);
  });

  it('đọc lại được token do chính mình phát hành: trả sid và hash để so với DB', () => {
    const { token, hash } = service.issueRefreshToken('9223372036854775807');
    expect(service.readRefreshToken(token)).toEqual({
      sessionId: '9223372036854775807',
      hash,
    });
  });

  it('từ chối khi sid bị sửa (chữ ký không còn khớp) — DN-31', () => {
    const { token } = service.issueRefreshToken('123');
    for (const sid of ['124', '12', '1230', '1']) {
      const [, random, signature] = token.split('.') as [
        string,
        string,
        string,
      ];
      expect(
        service.readRefreshToken(`${sid}.${random}.${signature}`),
        sid,
      ).toBeNull();
    }
  });

  it('từ chối khi phần ngẫu nhiên hoặc chữ ký bị sửa dù chỉ một ký tự — DN-31', () => {
    const { token } = service.issueRefreshToken('123');
    const [sid, random, signature] = token.split('.') as [
      string,
      string,
      string,
    ];
    const flip = (text: string) =>
      `${text[0] === 'A' ? 'B' : 'A'}${text.slice(1)}`;
    expect(
      service.readRefreshToken(`${sid}.${flip(random)}.${signature}`),
    ).toBeNull();
    expect(
      service.readRefreshToken(`${sid}.${random}.${flip(signature)}`),
    ).toBeNull();
    expect(
      service.readRefreshToken(`${sid}.${random}.${signature.slice(0, -1)}`),
    ).toBeNull();
  });

  it('từ chối token ký bằng khoá khác, kể cả khoá access (SE-06)', () => {
    const { token } = new TokenService(
      createTestConfigService({ JWT_REFRESH_SECRET: 'q'.repeat(40) }),
    ).issueRefreshToken('123');
    expect(service.readRefreshToken(token)).toBeNull();
    // Khoá access không ký được refresh token hợp lệ: đổi vai hai khoá
    const swapped = new TokenService(
      createTestConfigService({
        JWT_REFRESH_SECRET: TEST_AUTH_ENV.JWT_ACCESS_SECRET,
      }),
    ).issueRefreshToken('123');
    expect(service.readRefreshToken(swapped.token)).toBeNull();
  });

  it('từ chối chuỗi sai định dạng mà không ném lỗi', () => {
    const { token } = service.issueRefreshToken('123');
    const [sid, random, signature] = token.split('.') as [
      string,
      string,
      string,
    ];
    for (const junk of [
      '',
      'abc',
      '.',
      '..',
      `${sid}.${random}`,
      `${sid}.${random}.${signature}.thua`,
      `0.${random}.${signature}`,
      `0123.${random}.${signature}`,
      `-5.${random}.${signature}`,
      `${'9'.repeat(25)}.${random}.${signature}`,
      `${sid}.${random}!.${signature}`,
      `${token} `,
      ` ${token}`,
      token.replace('.', '\n'),
      'x'.repeat(1000),
    ]) {
      expect(
        service.readRefreshToken(junk),
        JSON.stringify(junk.slice(0, 30)),
      ).toBeNull();
    }
  });
});
