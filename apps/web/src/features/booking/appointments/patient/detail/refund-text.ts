import { formatVnd } from '../../common/appointment-format';
import type {
  RefundAmount,
  RefundPreview,
} from '../api/patient-appointment-types';
import { CANCEL_TEXT, cutoffLabel } from './detail-messages';

// Hiển thị số hoàn của hộp huỷ (booking F2). Hàm thuần. Mọi số tiền là chuỗi decimal của máy chủ: chỉ định dạng và so sánh CHUỖI, KHÔNG cộng, trừ,
// nhân tiền hay phần trăm ở client (H4; lệch tiền hiển thị so với backend là lỗi nghiêm trọng).

// "0", "0.00", "000.000": không có khoản nào. Dạng đã được bộ đọc kiểm (`readAmount`) nên chỉ cần nhận ra số 0.
const ZERO_AMOUNT = /^0+(\.0+)?$/;
export const isZeroAmount = (amount: string): boolean =>
  ZERO_AMOUNT.test(amount);

// `null` hay `soTien` bằng 0 ⇒ `null` (không hoàn); ngược lại "100.000đ (100%)"
export function refundLine(refund: RefundAmount | null): string | null {
  if (refund === null || isZeroAmount(refund.soTien)) return null;
  return `${formatVnd(refund.soTien)} (${refund.tyLe}%)`;
}

// Dòng mốc chỉ khi có khoản hoàn VÀ `mocApDung` khác `null` (Đại duyệt 12/11/2026)
export function cutoffLine(refund: RefundPreview | null): string | null {
  if (refund === null || isZeroAmount(refund.soTien)) return null;
  return refund.mocApDung === null ? null : cutoffLabel(refund.mocApDung);
}

// Hai số hoàn có là MỘT không (Q18: số thực tế lệch số dự kiến khi giờ qua mốc giữa lúc xem và lúc xác nhận). "Không hoàn" (`null` hay 0) bằng nhau
// bất kể `tyLe`; còn lại so nguyên chuỗi tiền và `tyLe`.
export function sameRefund(
  expected: RefundAmount | null,
  actual: RefundAmount | null,
): boolean {
  const key = (refund: RefundAmount | null) =>
    refund === null || isZeroAmount(refund.soTien)
      ? 'none'
      : `${refund.tyLe}/${refund.soTien}`;
  return key(expected) === key(actual);
}

// Dòng kết quả sau khi huỷ: số THỰC TẾ
export function refundResultLine(actual: RefundAmount | null): string {
  const line = refundLine(actual);
  return line === null
    ? CANCEL_TEXT.noRefundPaid
    : `${CANCEL_TEXT.refundPaid}: ${line}`;
}
