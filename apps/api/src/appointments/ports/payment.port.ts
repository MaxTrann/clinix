import type { EntityManager } from 'typeorm';
import { NoopPort } from './noop-warning.js';

// Cổng sang module `payment` (PLAN booking 5.10 B). Thanh toán thật (B17) gọi NGƯỢC `AppointmentTransitionService.confirmPaid` trong giao dịch của nó
// và phải khoá `lich_hen` TRƯỚC `vi_noi_bo` (bảng khoá 5.3, tầng 6 trước tầng 7).

export interface PaymentPort {
  /** Cọc 0đ: ghi giao dịch 0đ trong CÙNG giao dịch tạo lịch (`em` của người gọi). */
  recordZeroPayment(
    em: EntityManager,
    input: { lichHenId: string; benhNhanId: string },
  ): Promise<void>;
}
export const PAYMENT_PORT = Symbol('PAYMENT_PORT');

export interface PaymentSummaryPort {
  /** Tiền cọc đã thu `ThanhCong` của lịch gốc (chuỗi đổi lịch), chuỗi decimal. */
  amountPaid(em: EntityManager, lichHenId: string): Promise<string>;
  /** Số còn phải thu, chuỗi decimal ≥ 0. */
  remainingToCollect(em: EntityManager, lichHenId: string): Promise<string>;
}
export const PAYMENT_SUMMARY_PORT = Symbol('PAYMENT_SUMMARY_PORT');

export class NoopPaymentPort extends NoopPort implements PaymentPort {
  protected readonly noopMessage =
    'PaymentPort đang dùng bản Noop (module payment chưa có): không ghi giao dịch 0đ.';

  recordZeroPayment(): Promise<void> {
    this.warnOnce();
    return Promise.resolve();
  }
}

export class NoopPaymentSummaryPort
  extends NoopPort
  implements PaymentSummaryPort
{
  protected readonly noopMessage =
    'PaymentSummaryPort đang dùng bản Noop (module payment chưa có): coi như chưa thu đồng nào.';

  amountPaid(): Promise<string> {
    this.warnOnce();
    return Promise.resolve('0.00');
  }

  /**
   * Chưa thu đồng nào nên còn phải thu = `gia_snapshot` (5.10 B). Đọc thường, KHÔNG khoá: người gọi đã khoá `lich_hen` (bảng 5.3, tầng 6).
   * Là Noop duy nhất có đọc DB.
   */
  async remainingToCollect(
    em: EntityManager,
    lichHenId: string,
  ): Promise<string> {
    this.warnOnce();
    const rows = await em.query<{ giaSnapshot: string }[]>(
      'SELECT CAST(gia_snapshot AS CHAR) AS giaSnapshot FROM lich_hen WHERE lich_hen_id = ?',
      [lichHenId],
    );
    const row = rows[0];
    if (!row)
      throw new Error(
        'NoopPaymentSummaryPort: lịch hẹn không tồn tại (người gọi phải khoá lịch hẹn trước khi hỏi số còn phải thu)',
      );
    return row.giaSnapshot;
  }
}
