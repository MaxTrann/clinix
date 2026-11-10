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

export type PaymentMethod = 'Vi' | 'VNPay' | 'MoMo' | 'TienMatTaiQuay';

/**
 * Tóm tắt thanh toán để HIỂN THỊ ở chi tiết lịch hẹn của Bệnh nhân (task B2; TRACKING booking 3.15 B2-E). Hình dạng `[đề xuất]`: PLAN `payment` (B17) chốt.
 * Tiền là chuỗi decimal (H11), `thoiDiem` là ISO 8601 UTC. Cố ý KHÔNG có mã cổng thanh toán, id ví, người thu: service của booking ánh xạ từng khoá nên
 * dù bản thật trả thừa cột thì cũng không lọt ra JSON.
 */
export interface PaymentView {
  daThu: string;
  conPhaiThu: string;
  giaoDich: { phuongThuc: PaymentMethod; soTien: string; thoiDiem: string }[];
}

export interface PaymentSummaryPort {
  /** Tiền cọc đã thu `ThanhCong` của lịch gốc (chuỗi đổi lịch), chuỗi decimal. */
  amountPaid(em: EntityManager, lichHenId: string): Promise<string>;
  /** Số còn phải thu, chuỗi decimal ≥ 0. */
  remainingToCollect(em: EntityManager, lichHenId: string): Promise<string>;
  /** Chỉ ĐỌC, trong giao dịch của người gọi (cùng ảnh chụp với hàng `lich_hen`); `null` khi chưa có module `payment` (L17). */
  findPayment(
    em: EntityManager,
    lichHenId: string,
  ): Promise<PaymentView | null>;
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

  /** Chưa có `payment` ⇒ không có gì để hiển thị: `null`, không phải "0.00" (L17, Q20). Không đọc DB. */
  findPayment(): Promise<PaymentView | null> {
    this.warnOnce();
    return Promise.resolve(null);
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
