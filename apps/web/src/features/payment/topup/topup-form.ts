// Luật THUẦN của tab Nạp tiền (payment F2): số tiền, cổng, URL chuyển hướng. Không React, không mạng, để test từng nhánh.

/** Cổng nạp web biết (khớp `TOPUP_GATEWAYS` của API). Thứ tự = thứ tự hiện trên màn hình (Figma `430:2`). */
export const TOPUP_GATEWAYS = ['VNPay', 'MoMo'] as const;
export type TopupGateway = (typeof TOPUP_GATEWAYS)[number];

/** Sáu mức nhanh của Figma `430:2` (đồng). Mức nằm ngoài hạn mức máy chủ trả thì ẩn. */
export const QUICK_AMOUNTS = [
  '50000',
  '100000',
  '200000',
  '500000',
  '1000000',
  '2000000',
] as const;

/**
 * Host được phép chuyển trình duyệt tới (WNT-03, BDT-09): chỉ trang thanh toán của VNPAY (sandbox và thật). URL do máy chủ trả vẫn bị kiểm ở đây để một phản hồi
 * hỏng hay bị chèn không đưa Bệnh nhân sang trang lạ. `[đề xuất]` host thật `pay.vnpay.vn` theo tài liệu VNPAY; MoMo (B16) thêm host của nó.
 */
export const ALLOWED_REDIRECT_HOSTS: readonly string[] = [
  'sandbox.vnpayment.vn',
  // Sandbox cấp cho mã đăng ký từ 11/2026: thư của VNPAY ghi URL thanh toán TEST ở host này
  'sandbox.vnpaytest.vn',
  'pay.vnpay.vn',
];

/** Lọc danh sách cổng thô của API: chỉ giữ cổng web biết, đúng thứ tự Figma, không trùng. */
export function knownGateways(raw: readonly string[]): TopupGateway[] {
  return TOPUP_GATEWAYS.filter((gateway) => raw.includes(gateway));
}

/** Chỉ giữ chữ số của ô nhập (người dùng gõ "200.000" hay "200000" đều được). Tối đa 10 chữ số như DTO của API. */
export function digitsOf(input: string): string {
  return input
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 10);
}

/** Phần nguyên đồng của chuỗi decimal ("2000000.00" ⇒ "2000000"). */
export function wholeDong(amount: string): string {
  return amount.split('.')[0] ?? '0';
}

/** So hai số nguyên dương dạng chuỗi chữ số không số 0 đầu (không qua `Number`). */
function compareDigits(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export type AmountProblem = 'required' | 'outOfRange' | null;

/** Kiểm số tiền (chữ số, đồng) với hạn mức máy chủ trả. */
export function amountProblem(
  digits: string,
  limits: { toiThieu: string; toiDa: string },
): AmountProblem {
  if (digits === '' || /^0+$/.test(digits)) return 'required';
  if (
    compareDigits(digits, wholeDong(limits.toiThieu)) < 0 ||
    compareDigits(digits, wholeDong(limits.toiDa)) > 0
  )
    return 'outOfRange';
  return null;
}

/** Mức nhanh nằm trong hạn mức (máy chủ hạ hạn mức thì mức vượt bị ẩn). */
export function quickAmountsWithin(limits: {
  toiThieu: string;
  toiDa: string;
}): string[] {
  return QUICK_AMOUNTS.filter(
    (amount) => amountProblem(amount, limits) === null,
  );
}

/** URL chuyển hướng hợp lệ: `https:` và host thuộc danh sách cho phép (WNT-03). */
export function isAllowedRedirect(
  url: string,
  allowedHosts: readonly string[] = ALLOWED_REDIRECT_HOSTS,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && allowedHosts.includes(parsed.hostname);
}

/** `[đề xuất]` Khoảng chờ giữa các lần hỏi lại khi còn `DangXuLy`: tổng khoảng 30 giây (VNPAY thường gửi IPN trong vài giây). */
export const POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 12000] as const;
