import { NoopPort } from './noop-warning.js';

// Cổng sang module `wallet` (PLAN booking 5.10 B, 5.6). `refund` chạy SAU commit, đúng một lần: lỗi hoàn KHÔNG hoàn tác việc huỷ (HLH A3).

export type RefundResult = { kind: 'Refunded' | 'Failed' | 'NotNeeded' };

export interface RefundPort {
  /** `soTien` là chuỗi decimal (H11); không nhận `EntityManager` vì chạy ngoài giao dịch huỷ. */
  refund(input: {
    lichHenId: string;
    soTien: string;
    lyDo: string;
  }): Promise<RefundResult>;
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
