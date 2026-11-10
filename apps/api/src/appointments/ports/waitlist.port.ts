import { NoopPort } from './noop-warning.js';

// Cổng sang module `waitlist` (PLAN booking 5.10 B). Chỉ `onSlotReleased`: `holdForInvitation` và `releaseInvitationHold` thuộc `SlotHoldService` của
// booking (B6), do `waitlist` gọi vào, không phải cổng.

export interface WaitlistPort {
  /** Sau commit, đúng một lần; chỉ khi khung giờ còn ở tương lai và lý do huỷ khác `BacSiNghiPhep` (người gọi quyết định, 5.6). */
  onSlotReleased(khungGioId: string): Promise<void>;
}
export const WAITLIST_PORT = Symbol('WAITLIST_PORT');

export class NoopWaitlistPort extends NoopPort implements WaitlistPort {
  protected readonly noopMessage =
    'WaitlistPort đang dùng bản Noop (module waitlist chưa có): không mời danh sách chờ.';

  onSlotReleased(): Promise<void> {
    this.warnOnce();
    return Promise.resolve();
  }
}
