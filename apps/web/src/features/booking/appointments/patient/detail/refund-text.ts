import type { RefundPreview } from '../api/patient-appointment-types';
import type { RefundAmount } from '../../common/refund-types';
import { isZeroAmount } from '../../common/refund-text';
import { cutoffLabel } from './detail-messages';

// Phần của hiển thị số hoàn chỉ dành cho hộp huỷ CÓ XEM TRƯỚC của Bệnh nhân (booking F2). `isZeroAmount`, `refundLine`, `refundResultLine` chuyển lên
// `common/refund-text.ts` ở F9 (hộp huỷ của Lễ tân dùng chung). Vẫn chỉ so sánh CHUỖI, KHÔNG tính tiền ở client (H4).

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
