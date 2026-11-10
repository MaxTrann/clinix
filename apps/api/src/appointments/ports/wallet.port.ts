import type { EntityManager } from 'typeorm';
import { NoopPort } from './noop-warning.js';

// Cổng sang module `wallet` (PLAN booking 5.10 B, 5.6). `refund` chạy SAU commit, đúng một lần: lỗi hoàn KHÔNG hoàn tác việc huỷ (HLH A3).

export type RefundResult = { kind: 'Refunded' | 'Failed' | 'NotNeeded' };

/**
 * Lần hoàn cọc mới nhất của lịch, để HIỂN THỊ ở chi tiết lịch hẹn của Bệnh nhân (task B2; TRACKING booking 3.15 B2-E). Hình dạng `[đề xuất]`: PLAN `wallet` (B16)
 * chốt. `soTien` là chuỗi decimal (H11), `thoiDiem` là ISO 8601 UTC. Cố ý không có id ví hay số lần thử (xem `PaymentView`).
 */
export interface RefundView {
  soTien: string;
  trangThai: 'ThanhCong' | 'ThatBai';
  thoiDiem: string;
}

export interface RefundPort {
  /** `soTien` là chuỗi decimal (H11); không nhận `EntityManager` vì chạy ngoài giao dịch huỷ. */
  refund(input: {
    lichHenId: string;
    soTien: string;
    lyDo: string;
  }): Promise<RefundResult>;
  /** Chỉ ĐỌC (khác `refund`): nhận `em` của người gọi để cùng ảnh chụp với hàng `lich_hen`; `null` khi chưa có module `wallet` hoặc chưa hoàn lần nào (L17). */
  findRefund(em: EntityManager, lichHenId: string): Promise<RefundView | null>;
}
export const REFUND_PORT = Symbol('REFUND_PORT');

export interface WalletBalancePort {
  /** Số dư khả dụng (chuỗi decimal) để hiển thị Bước 5, hoặc `null` khi chưa có ví thật. */
  available(benhNhanId: string): Promise<string | null>;
}
export const WALLET_BALANCE_PORT = Symbol('WALLET_BALANCE_PORT');

export class NoopRefundPort extends NoopPort implements RefundPort {
  protected readonly noopMessage =
    'RefundPort đang dùng bản Noop (module wallet chưa có): không hoàn tiền.';

  refund(): Promise<RefundResult> {
    this.warnOnce();
    return Promise.resolve({ kind: 'NotNeeded' });
  }

  /** Chưa có `wallet` ⇒ không có lần hoàn nào để hiển thị: `null` (L17). Không đọc DB. */
  findRefund(): Promise<RefundView | null> {
    this.warnOnce();
    return Promise.resolve(null);
  }
}

export class NoopWalletBalancePort
  extends NoopPort
  implements WalletBalancePort
{
  protected readonly noopMessage =
    'WalletBalancePort đang dùng bản Noop (module wallet chưa có): không có số dư ví.';

  available(): Promise<string | null> {
    this.warnOnce();
    return Promise.resolve(null);
  }
}
