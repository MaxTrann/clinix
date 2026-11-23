import type { EntityManager } from 'typeorm';
import type { CaLamViec } from '../../admin/entities/enums.js';
import { NoopPort } from './noop-warning.js';

// Cổng thay đổi chi nhánh đã duyệt chưa áp dụng (PLAN booking 5.10 B; admin Q6, Q48, B10). Bản thật (B16b, TRACKING 3.50) là ADAPTER `PendingBranchChangesAdapter`
// (`pending-branch-changes.adapter.ts`) bọc `PendingBranchChangesReader.getPendingEffectiveChanges(em, chiNhanhId)` của admin (trả cả yêu cầu quá hạn): admin trả DANH SÁCH theo
// chi nhánh, còn cổng này hỏi theo từng khung giờ nên không dùng `useExisting` được.
// `ca` (B16b, Đại duyệt 23/11/2026): luật "ngoài giờ mới" của admin (`branch-impact.service.ts`) tính theo CA của khung giờ (CaSang vào khoảng sáng mới, CaChieu vào khoảng chiều mới);
// thiếu `ca` thì booking lỏng hơn admin. Cùng kiểu với `DoctorLeavePort` (cũng nhận `ca`).

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
      /** Ca của khung giờ (`lich_lam_viec.ca`) */
      ca: CaLamViec;
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
    'PendingBranchChangesPort đang dùng bản Noop (test dựng riêng; AppointmentsModule dùng PendingBranchChangesAdapter từ B16b): không chặn vùng bị loại.';

  findBlocking(): Promise<PendingBranchChange | null> {
    this.warnOnce();
    return Promise.resolve(null);
  }
}
