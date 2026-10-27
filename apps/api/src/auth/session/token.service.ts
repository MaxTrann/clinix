import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, errors, jwtVerify } from 'jose';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_RANDOM_BYTES,
} from '../auth.constants.js';

export interface AccessTokenClaims {
  accountId: string;
  sessionId: string;
}

// Id bigint dạng chuỗi, không có số 0 đứng đầu (tối đa 19 chữ số)
const ID_PATTERN = /^[1-9][0-9]{0,18}$/;
// 32 byte mã hoá base64url luôn dài đúng 43 ký tự; HMAC-SHA-256 cũng 32 byte
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;
const MAX_REFRESH_TOKEN_LENGTH = 200;

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// Phát hành và kiểm tra token. Không chạm DB: việc tra phiên là của SessionService.
// Hai loại bí mật dùng hai khoá riêng (SE-06): JWT_ACCESS_SECRET ký access token, JWT_REFRESH_SECRET ký refresh token.
@Injectable()
export class TokenService {
  private readonly accessKey: Uint8Array;
  private readonly refreshKey: Buffer;

  constructor(
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.accessKey = new TextEncoder().encode(
      config.get('JWT_ACCESS_SECRET', { infer: true }),
    );
    this.refreshKey = Buffer.from(
      config.get('JWT_REFRESH_SECRET', { infer: true }),
      'utf8',
    );
  }

  // ---------- Access token: JWT HS256, mang mã tài khoản (sub) và mã phiên (sid), sống 15 phút ----------

  // `notAfter` là mốc cuối cùng token còn dùng được, thường là tao_luc + 8 giờ: token cấp lúc 7 giờ 59 phút
  // không được sống quá trần 8 giờ của phiên (H14). exp được làm tròn xuống giây vì JWT chỉ có độ chính xác giây.
  async signAccessToken(input: {
    accountId: string;
    sessionId: string;
    notAfter: Date;
  }): Promise<{ token: string; expiresAt: Date }> {
    const now = new Date();
    const expiresAtSeconds = Math.floor(
      Math.min(now.getTime() + ACCESS_TOKEN_TTL_MS, input.notAfter.getTime()) /
        1000,
    );
    const token = await new SignJWT({ sid: input.sessionId })
      .setProtectedHeader({ alg: ACCESS_TOKEN_ALGORITHM, typ: 'JWT' })
      .setSubject(input.accountId)
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.accessKey);
    return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
  }

  // Trả null với MỌI token không dùng được (sai chữ ký, sai alg hoặc alg none, sai issuer/audience, hết hạn, thiếu hoặc hỏng claims).
  // `algorithms` là danh sách cho phép cố định: thiếu nó, thư viện có thể chấp nhận thuật toán do chính token tự khai.
  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.accessKey, {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
        typ: 'JWT',
        requiredClaims: ['sub', 'sid', 'exp', 'iat'],
      });
      const { sub, sid } = payload;
      if (
        typeof sub !== 'string' ||
        typeof sid !== 'string' ||
        !ID_PATTERN.test(sub) ||
        !ID_PATTERN.test(sid)
      ) {
        return null;
      }
      return { accountId: sub, sessionId: sid };
    } catch (error) {
      if (error instanceof errors.JOSEError) return null; // token không hợp lệ là chuyện bình thường, không phải lỗi hệ thống
      throw error;
    }
  }

  // ---------- Refresh token: <sid>.<256 bit ngẫu nhiên>.<HMAC> ----------
  // Chữ ký HMAC giúp (1) loại token giả mà không cần chạm DB và (2) không ai chế được token mang sid của người khác
  // để cố ý kích hoạt "phát hiện dùng lại" thu hồi phiên của họ. DB chỉ lưu SHA-256 của cả chuỗi token (H10):
  // token đã có 256 bit ngẫu nhiên nên băm nhanh là đủ, không cần băm chậm như mật khẩu.

  issueRefreshToken(sessionId: string): { token: string; hash: string } {
    const payload = `${sessionId}.${randomBytes(REFRESH_TOKEN_RANDOM_BYTES).toString('base64url')}`;
    const token = `${payload}.${this.sign(payload)}`;
    return { token, hash: sha256Hex(token) };
  }

  // Chỉ trả kết quả khi chuỗi đúng định dạng VÀ chữ ký HMAC đúng; còn lại null (không tra DB, không thu hồi gì)
  readRefreshToken(raw: string): { sessionId: string; hash: string } | null {
    if (raw.length > MAX_REFRESH_TOKEN_LENGTH) return null;
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    const [sessionId, random, signature] = parts as [string, string, string];
    if (
      !ID_PATTERN.test(sessionId) ||
      !BASE64URL_32_BYTES.test(random) ||
      !BASE64URL_32_BYTES.test(signature)
    ) {
      return null;
    }
    const expected = Buffer.from(this.sign(`${sessionId}.${random}`));
    const given = Buffer.from(signature);
    // Độ dài đã bằng nhau nhờ kiểm định dạng; timingSafeEqual để thời gian so không lộ vị trí byte sai đầu tiên
    if (expected.length !== given.length || !timingSafeEqual(expected, given))
      return null;
    return { sessionId, hash: sha256Hex(raw) };
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.refreshKey)
      .update(payload)
      .digest('base64url');
  }
}
