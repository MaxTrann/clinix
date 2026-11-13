import { formatVnd } from './appointment-format';
import type { RefundAmount } from './refund-types';

// Hiển thị số hoàn sau khi huỷ (booking F2 viết trong `patient/detail/`, chuyển lên `common/` ở F9: hộp huỷ của Lễ tân cũng hiện số THỰC TẾ). Hàm thuần.
// Mọi số tiền là chuỗi decimal của máy chủ: chỉ định dạng và so sánh CHUỖI, KHÔNG cộng, trừ, nhân tiền hay phần trăm ở client (H4; lệch tiền hiển thị so với
// backend là lỗi nghiêm trọng). `cutoffLine` và `sameRefund` chỉ dành cho hộp có xem trước nên ở lại `patient/detail/refund-text.ts`.
export const REFUND_TEXT = {
  paid: 'Số tiền hoàn',
  none: 'Không có khoản hoàn.',
} as const;

// "0", "0.00", "000.000": không có khoản nào. Dạng đã được bộ đọc kiểm (`readAmount`) nên chỉ cần nhận ra số 0.
const ZERO_AMOUNT = /^0+(\.0+)?$/;
export const isZeroAmount = (amount: string): boolean =>
  ZERO_AMOUNT.test(amount);

// `null` hay `soTien` bằng 0 ⇒ `null` (không hoàn); ngược lại "100.000đ (100%)"
export function refundLine(refund: RefundAmount | null): string | null {
  if (refund === null || isZeroAmount(refund.soTien)) return null;
  return `${formatVnd(refund.soTien)} (${refund.tyLe}%)`;
}

// Dòng kết quả sau khi huỷ: số THỰC TẾ
export function refundResultLine(actual: RefundAmount | null): string {
  const line = refundLine(actual);
  return line === null ? REFUND_TEXT.none : `${REFUND_TEXT.paid}: ${line}`;
}
