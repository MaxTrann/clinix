import { toSingleLine } from '../../mail/mail-safety.js';
import { formatVnd } from '../../appointments/notifications/mail-format.js';
import { addMoney, compareMoney, subtractMoney } from '../../pricing/money.js';
import {
  NOTIFICATION_MAX_LENGTH,
  REFUND_MAX_ATTEMPTS,
} from '../wallet.constants.js';

// Luật THUẦN của hoàn cọc tự động (payment B8; PLAN 5.6.1). Không DB, không giờ: test đơn vị phủ từng nhánh, service chỉ gọi.

/** Một dòng `lich_su_hoan_tien` đọc ra để quyết định (tiền là chuỗi decimal). */
export interface RefundAttemptRow {
  loai: 'TuDong' | 'DacBiet';
  trangThai: 'ThanhCong' | 'ThatBai';
  soTien: string;
  soLanThu: number;
}

/** Tổng đã hoàn THÀNH CÔNG của khoản thanh toán, cả tự động lẫn đặc biệt (trần "tổng hoàn ≤ đã thanh toán qua ví", IVT-06). */
export function totalRefunded(rows: readonly RefundAttemptRow[]): string {
  return rows
    .filter((row) => row.trangThai === 'ThanhCong')
    .reduce((sum, row) => addMoney(sum, row.soTien), '0.00');
}

/** Số lần thử TỰ ĐỘNG đã thất bại (hoàn đặc biệt lỗi không ghi dòng, và dòng thành công không tính). */
export function failedAutoAttempts(rows: readonly RefundAttemptRow[]): number {
  return rows.filter(
    (row) => row.loai === 'TuDong' && row.trangThai === 'ThatBai',
  ).length;
}

/** `so_lan_thu` kế tiếp: UNIQUE `(giao_dich_thanh_toan_id, so_lan_thu)` đếm CHUNG mọi dòng của khoản (tự động và đặc biệt). */
export function nextAttemptNumber(rows: readonly RefundAttemptRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.soLanThu), 0) + 1;
}

export type RefundDecision =
  /** Ý định tự động đã có dòng `ThanhCong`: gọi lặp, KHÔNG cộng lần hai (HCC-03) */
  | { kind: 'AlreadyRefunded' }
  /** Đã đủ lần thử tự động thất bại: dừng, chờ Quản trị viên (HCC-06) */
  | { kind: 'AttemptsExhausted' }
  /** Không còn gì để hoàn (đã hoàn hết tới trần) */
  | { kind: 'NothingLeft' }
  /** Cộng `soTien` (đã cắt theo trần) với số lần thử `soLanThu` */
  | { kind: 'Credit'; soTien: string; soLanThu: number };

/**
 * Quyết định dưới khoá 7a, từ các dòng hoàn của khoản thanh toán. Thứ tự kiểm quan trọng: đã hoàn xong ⇒ `AlreadyRefunded` TRƯỚC khi xét số lần thử (một khoản đã hoàn thành công thì dù từng
 * thất bại bao nhiêu lần cũng không được báo "hết lượt"). Số cộng = `min(soTien, đã thanh toán − tổng đã hoàn)`: booking đã tính trên `amountRefundable` nên `min` chỉ là lưới an toàn (HCC-12).
 */
export function decideRefund(input: {
  rows: readonly RefundAttemptRow[];
  /** `giao_dich_thanh_toan.so_tien` của khoản thanh toán qua ví */
  daThanhToan: string;
  soTien: string;
}): RefundDecision {
  if (
    input.rows.some(
      (row) => row.loai === 'TuDong' && row.trangThai === 'ThanhCong',
    )
  )
    return { kind: 'AlreadyRefunded' };
  if (failedAutoAttempts(input.rows) >= REFUND_MAX_ATTEMPTS)
    return { kind: 'AttemptsExhausted' };

  const room =
    compareMoney(input.daThanhToan, totalRefunded(input.rows)) > 0
      ? subtractMoney(input.daThanhToan, totalRefunded(input.rows))
      : '0.00';
  const amount = compareMoney(input.soTien, room) <= 0 ? input.soTien : room;
  if (compareMoney(amount, '0.00') <= 0) return { kind: 'NothingLeft' };
  return {
    kind: 'Credit',
    soTien: amount,
    soLanThu: nextAttemptNumber(input.rows),
  };
}

/**
 * `noi_dung` thông báo cho Bệnh nhân: một dòng, ≤ 500 ký tự, chữ `[đề xuất]` (PLAN 5.12). Mã lịch và số tiền đi qua `toSingleLine` TRƯỚC khi ghép; không có số dư, không có mã cổng.
 */
export function buildRefundedText(maLichHen: string, soTien: string): string {
  return toSingleLine(
    `Đã hoàn ${formatVnd(soTien)}đ tiền cọc của lịch hẹn ${toSingleLine(maLichHen, 20)} vào ví của bạn.`,
    NOTIFICATION_MAX_LENGTH,
  );
}

/** `noi_dung` thông báo cho Quản trị viên khi hoàn cọc hết lượt thử: nói rõ phải xử lý bằng hoàn tiền đặc biệt (PLAN 5.6.1). Không có tên hay số điện thoại Bệnh nhân. */
export function buildNeedsAttentionText(maLichHen: string): string {
  return toSingleLine(
    `Hoàn cọc tự động của lịch hẹn ${toSingleLine(maLichHen, 20)} chưa thực hiện được sau nhiều lần thử. Cần xử lý bằng hoàn tiền đặc biệt.`,
    NOTIFICATION_MAX_LENGTH,
  );
}
