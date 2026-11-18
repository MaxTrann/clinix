import { createHmac, timingSafeEqual } from 'node:crypto';

// Quy tắc ký của VNPAY (payment B3). Tài liệu VNPAY không nói rõ có mã hoá URL khi ký hay không (rủi ro H14), nên quy tắc dưới đây lấy từ SỐ ĐO thật
// với sandbox (M12, 18/11/2026): ký trên chuỗi ĐÃ mã hoá thì VNPAY chấp nhận, ký trên chuỗi thô thì VNPAY báo "Sai chữ ký"; chữ ký VNPAY gửi về
// cũng khớp cách ĐÃ mã hoá. Chữ ký VNPAY gửi về là hex chữ thường, dài 128 ký tự (HMAC-SHA512), không kèm `vnp_SecureHashType`.

const HASH_PARAM = 'vnp_SecureHash';
const HASH_TYPE_PARAM = 'vnp_SecureHashType';

/** HMAC-SHA512 dạng hex = 128 ký tự. */
export const VNPAY_HASH_HEX_LENGTH = 128;

/**
 * Mã hoá một tên hay giá trị như khi ký: `encodeURIComponent`, khoảng trắng thành `+` (giống mẫu Node của VNPAY).
 * GIỚI HẠN: chưa đo các ký tự `! ' ( ) * ~` (`encodeURIComponent` không mã hoá chúng, mẫu PHP thì có). CLINIX không gửi các ký tự này
 * (`vnp_OrderInfo` là câu cố định), và các tham số VNPAY gửi về đã đo đều là chữ, số.
 */
export function encodeVnpayValue(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

/**
 * Chuỗi đem ký: mọi tham số tên bắt đầu bằng `vnp_` (trừ chính chữ ký và loại chữ ký), sắp tăng dần theo tên, `tên=giá trị` đã mã hoá, nối bằng `&`.
 * Tham số `vnp_` lạ vẫn vào chuỗi ký (đúng đặc tả: VNPAY ký mọi tham số nó gửi); tham số không phải `vnp_` bị bỏ qua.
 */
export function vnpaySignData(
  params: Readonly<Record<string, string>>,
): string {
  return Object.keys(params)
    .filter(
      (name) =>
        name.startsWith('vnp_') &&
        name !== HASH_PARAM &&
        name !== HASH_TYPE_PARAM,
    )
    .sort()
    .map(
      (name) =>
        `${encodeVnpayValue(name)}=${encodeVnpayValue(params[name] ?? '')}`,
    )
    .join('&');
}

/** Chữ ký `vnp_SecureHash` (hex chữ thường) của bộ tham số. */
export function signVnpay(
  params: Readonly<Record<string, string>>,
  secret: string,
): string {
  return createHmac('sha512', secret)
    .update(vnpaySignData(params), 'utf8')
    .digest('hex');
}

const HEX_DIGEST = /^[0-9a-f]+$/i;

/**
 * So hai chữ ký hex trong thời gian hằng (`timingSafeEqual`), không phân biệt hoa thường. Độ dài khác hay ký tự lạ ⇒ `false`, KHÔNG ném lỗi
 * (`timingSafeEqual` tự nó ném khi hai buffer dài khác nhau, nên phải kiểm độ dài trước).
 */
export function sameHexDigest(actual: string, expected: string): boolean {
  if (actual.length !== expected.length || !HEX_DIGEST.test(actual))
    return false;
  return timingSafeEqual(
    Buffer.from(actual.toLowerCase(), 'utf8'),
    Buffer.from(expected.toLowerCase(), 'utf8'),
  );
}

/** Chữ ký trong `params` có khớp với chữ ký tự tính bằng `secret` không. Thiếu chữ ký hay chữ ký sai dạng ⇒ `false`. */
export function verifyVnpaySignature(
  params: Readonly<Record<string, string>>,
  secret: string,
): boolean {
  const received = params[HASH_PARAM];
  if (received === undefined || received.length !== VNPAY_HASH_HEX_LENGTH)
    return false;
  return sameHexDigest(received, signVnpay(params, secret));
}
