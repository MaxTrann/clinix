import type { EntityManager } from 'typeorm';
import { NoopPort } from './noop-warning.js';

// Cổng thay đổi chi nhánh đã duyệt chưa áp dụng (PLAN booking 5.10 B; admin Q6, Q48, B10). Bản thật (B16) là ADAPTER bọc `getPendingEffectiveChanges(chiNhanhId)`
// của admin (trả cả yêu cầu quá hạn): admin trả danh sách theo chi nhánh, còn cổng này hỏi theo từng khung giờ nên không dùng `useExisting` được.
// Chữ ký là `[đề xuất]`; kiểu trả về của hàm admin còn `[cần điền]` tới khi admin B10 có mã.

export interface PendingBranchChange {
  yeuCauThayDoiChiNhanhId: string;
}

export interface PendingBranchChangesPort {
  /** Có yêu cầu đã duyệt chưa áp dụng loại khung giờ này khỏi lịch mới hay không (chặn đặt, sau này cả đổi lịch). */
  findBlocking(
    em: EntityManager,
    input: {
      chiNhanhId: string;
      ngayGio: Date;
      thoiLuongPhut: number;
      dichVuKhamId: string;
    },
  ): Promise<PendingBranchChange | null>;
}
export const PENDING_BRANCH_CHANGES_PORT = Symbol(
  'PENDING_BRANCH_CHANGES_PORT',
);

export class NoopPendingBranchChangesPort
  extends NoopPort
  implements PendingBranchChangesPort
{
  protected readonly noopMessage =
    'PendingBranchChangesPort đang dùng bản Noop (admin B10 chưa có): không chặn vùng bị loại.';

  findBlocking(): Promise<PendingBranchChange | null> {
    this.warnOnce();
    return Promise.resolve(null);
  }
}
