import { randomBytes, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from '../../auth/session/token.service.js';
import {
  ACTIVATION_PAGE_PATH,
  ACTIVATION_TOKEN_BYTES,
  ACTIVATION_TOKEN_PATTERN,
} from './staff-activation.constants.js';

// Sinh, băm và so khớp token kích hoạt (PLAN admin 5.5, Q25). Hàm thuần, không đụng DB.
// Token KHÔNG bao giờ được ghi log, đưa vào lỗi hay audit; DB chỉ lưu băm của nó.

const HEX_SHA256 = /^[0-9a-f]{64}$/;
// Id bigint dạng chuỗi, không có số 0 đứng đầu (tối đa 19 chữ số), cùng quy ước với token.service của auth
// Xuất ra để B16 (kích hoạt công khai) kiểm id người dùng gửi bằng ĐÚNG dạng mà `buildActivationUrl` đã sinh
export const ID_PATTERN = /^[1-9][0-9]{0,18}$/;

/** 32 byte ngẫu nhiên an toàn, mã hoá base64url (43 ký tự). */
export function generateActivationToken(): string {
  return randomBytes(ACTIVATION_TOKEN_BYTES).toString('base64url');
}

/**
 * `ma_bam` = SHA-256 (hex 64 ký tự) của CHUỖI token đúng như nó nằm trong liên kết, KHÔNG băm byte đã giải mã:
 * base64url 43 ký tự có 2 bit cuối thừa, nên hai chuỗi chỉ khác ký tự cuối có thể giải mã ra cùng 32 byte; băm chuỗi thì mỗi token chỉ có một dạng.
 * Dùng chung `sha256Hex` của auth (đã dùng cho refresh token), không viết lần hai.
 */
export function hashActivationToken(token: string): string {
  return sha256Hex(token);
}

/**
 * So token người dùng gửi với băm đã lưu bằng `timingSafeEqual` trên hai buffer cùng độ dài (32 byte).
 * `timingSafeEqual` ném RangeError khi hai buffer khác độ dài nên dạng và độ dài được kiểm TRƯỚC và trả false (không ném, không lộ gì):
 * token đúng luôn dài đúng 43 ký tự và băm hợp lệ luôn 64 hex, nên hai thứ đó không phải bí mật; chuỗi sai dạng hay băm lưu hỏng chỉ là "không khớp".
 */
export function activationTokenMatches(
  storedHex: string,
  presented: string,
): boolean {
  if (!ACTIVATION_TOKEN_PATTERN.test(presented)) return false;
  if (!HEX_SHA256.test(storedHex)) return false;
  const expected = Buffer.from(hashActivationToken(presented), 'hex');
  const stored = Buffer.from(storedHex, 'hex');
  return stored.length === expected.length && timingSafeEqual(stored, expected);
}

/**
 * `WEB_ORIGIN/kich-hoat#id=<ma_xac_thuc_id>&token=<token>` (Q25). `webOrigin` đã được validateEnv bảo đảm là origin thuần (không dấu / cuối).
 * Id và token sai dạng là lỗi lập trình (do chính mã tạo ra) nên ném lỗi, để không bao giờ gửi đi một liên kết hỏng.
 */
export function buildActivationUrl(
  webOrigin: string,
  maXacThucId: string,
  token: string,
): string {
  if (!ID_PATTERN.test(maXacThucId)) {
    throw new Error('Mã liên kết kích hoạt không đúng dạng id');
  }
  if (!ACTIVATION_TOKEN_PATTERN.test(token)) {
    throw new Error('Token kích hoạt không đúng dạng 43 ký tự base64url');
  }
  return `${webOrigin}${ACTIVATION_PAGE_PATH}#id=${maXacThucId}&token=${token}`;
}
