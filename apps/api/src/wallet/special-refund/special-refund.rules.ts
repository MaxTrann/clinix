import { formatVnd } from '../../appointments/notifications/mail-format.js';
import { toSingleLine } from '../../mail/mail-safety.js';
import { compareMoney, subtractMoney } from '../../pricing/money.js';
import {
  totalRefunded,
  type RefundAttemptRow,
} from '../refund/refund.rules.js';
import { NOTIFICATION_MAX_LENGTH } from '../wallet.constants.js';

// Luật THUẦN của hoàn tiền đặc biệt (payment B13; PLAN 5.6.2). Không DB, không giờ: test đơn vị phủ từng nhánh, service chỉ gọi dưới khoá 7a.
// Trần dùng CHUNG với hoàn cọc tự động (B8): tổng mọi dòng `ThanhCong` (tự động và đặc biệt) ≤ số đã thanh toán qua ví (IVT-06).

/** Số còn hoàn được của một khoản = đã thanh toán − tổng đã hoàn thành công; không âm. */
export function refundableOf(
  daThanhToan: string,
  rows: readonly RefundAttemptRow[],
): { daHoan: string; conCoTheHoan: string } {
  const daHoan = totalRefunded(rows);
  const conCoTheHoan =
    compareMoney(daThanhToan, daHoan) > 0
      ? subtractMoney(daThanhToan, daHoan)
      : '0.00';
  return { daHoan, conCoTheHoan };
}

/** Khoản đã có hoàn đặc biệt thành công: Figma `550:2` "mỗi lịch hẹn chỉ được hoàn đặc biệt một lần" (HDB-06). */
export function hasSpecialRefund(rows: readonly RefundAttemptRow[]): boolean {
  return rows.some(
    (row) => row.loai === 'DacBiet' && row.trangThai === 'ThanhCong',
  );
}

export type SpecialRefundDecision =
  | { kind: 'AlreadySpecial' }
  | { kind: 'Exceeds'; conCoTheHoan: string }
  | { kind: 'Credit' };

/** Quyết định dưới khoá 7a. "Đã hoàn đặc biệt" kiểm TRƯỚC trần: lần hai luôn là `DA_HOAN_DAC_BIET` dù còn chỗ hay không. Đúng bằng số còn lại là hợp lệ (biên). */
export function decideSpecialRefund(input: {
  rows: readonly RefundAttemptRow[];
  daThanhToan: string;
  soTien: string;
}): SpecialRefundDecision {
  if (hasSpecialRefund(input.rows)) return { kind: 'AlreadySpecial' };
  const { conCoTheHoan } = refundableOf(input.daThanhToan, input.rows);
  if (compareMoney(input.soTien, conCoTheHoan) > 0)
    return { kind: 'Exceeds', conCoTheHoan };
  return { kind: 'Credit' };
}

/** `noi_dung` thông báo cho Bệnh nhân: một dòng, ≤ 500 ký tự, chữ `[đề xuất]`. Không có lý do (lý do chỉ ở nhật ký), không có số dư. */
export function buildSpecialRefundText(
  maLichHen: string,
  soTien: string,
): string {
  return toSingleLine(
    `Quản trị viên đã hoàn ${formatVnd(soTien)}đ liên quan đến lịch hẹn ${toSingleLine(maLichHen, 20)} vào ví của bạn.`,
    NOTIFICATION_MAX_LENGTH,
  );
}
