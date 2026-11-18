// Cấu hình VNPAY đọc từ biến môi trường (payment B3; PLAN 5.4). Thiếu MỘT biến ⇒ `null` (cổng chưa cấu hình), giống `readMailConfig`:
// không giả vờ thành công, và không ghi giá trị nào ra log. Tên biến phải khớp `wallet/balance/configured-gateways.ts` (danh sách cổng hiển thị cho web).

export interface VnpayConfig {
  readonly tmnCode: string;
  readonly hashSecret: string;
  /** Trang thanh toán của VNPAY (sandbox: https://sandbox.vnpayment.vn/paymentv2/vpcpay.html). */
  readonly payUrl: string;
  /** Trang web của CLINIX mà VNPAY chuyển trình duyệt về sau khi thanh toán (chỉ hiển thị, không cộng ví ở đó). */
  readonly returnUrl: string;
}

export const VNPAY_ENV_NAMES = [
  'VNPAY_TMN_CODE',
  'VNPAY_HASH_SECRET',
  'VNPAY_PAY_URL',
  'VNPAY_RETURN_URL',
] as const;

type VnpayEnv = Readonly<Record<string, string | undefined>>;

/** Đọc cấu hình; thiếu biến hay biến chỉ có khoảng trắng ⇒ `null`. URL sai dạng ⇒ ném lỗi khi khởi động (thông báo chỉ nêu TÊN biến). */
export function readVnpayConfig(
  env: VnpayEnv = process.env,
): VnpayConfig | null {
  const [tmnCode, hashSecret, payUrl, returnUrl] = VNPAY_ENV_NAMES.map((name) =>
    (env[name] ?? '').trim(),
  );
  if (!tmnCode || !hashSecret || !payUrl || !returnUrl) return null;
  // Trang thanh toán bắt buộc HTTPS; trang quay về cho phép http để chạy ở máy dev (localhost).
  assertUrl('VNPAY_PAY_URL', payUrl, ['https:']);
  assertUrl('VNPAY_RETURN_URL', returnUrl, ['https:', 'http:']);
  return { tmnCode, hashSecret, payUrl, returnUrl };
}

function assertUrl(
  name: string,
  value: string,
  protocols: readonly string[],
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} không phải URL hợp lệ`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} phải dùng ${protocols.join(' hoặc ')}`);
  }
}
