import type { EntityManager } from 'typeorm';
import type { SlotHoldService } from './slot-hold.service.js';
import type { LockedSlot } from './slot-lock.js';

// "Giữ rồi đặt khung giờ" dùng chung cho `create` (đặt lịch) và đổi lịch (reschedule B1; PLAN reschedule 3.5 R8, 5.5 bước 5 và 6). Tách đúng hai khối từng lặp giữa hai luồng; mỗi hàm thay NGUYÊN VĂN một khối của
// `create` (thứ tự câu, đối số cho `SlotHoldService` và thông điệp lỗi không đổi: `create` không đổi hành vi). Hai hàm đứng TRƯỚC và SAU `INSERT lich_hen` (giữa chúng còn việc riêng của từng luồng: `create` đọc giá, đổi lịch sao chép
// ba bản chụp), nên KHÔNG gộp được thành một hàm bọc cả `INSERT` mà không dời câu của `create`.
//
// Cả hai nhận `em` của NGƯỜI GỌI và `LockedSlot` (bằng chứng đã khoá `khung_gio FOR UPDATE`), KHÔNG mở giao dịch, KHÔNG ném `AppException`, KHÔNG có SQL ghi (mọi ghi `khung_gio` đi qua `SlotHoldService`: AR-06).

export type LapsedHoldOutcome =
  /** Khung giờ đã trống (lịch giữ quá hạn đã `DaHuy` hoặc lời mời hết hạn đã được thả): người gọi đi tiếp tới `INSERT` */
  | 'Free'
  /** Không ghi gì: khung giờ chưa quá hạn, hoặc lịch giữ nó không còn `ChoThanhToan` dưới khoá. Người gọi từ chối `KHUNG_GIO_DANG_GIU` */
  | 'StillHeld';

/**
 * Hết hạn lười (PLAN booking 5.5): người gọi gọi hàm này khi `evaluateBookability` trả `lapsedHold` khác `null`, TRƯỚC `INSERT lich_hen`. Chỉ `Expired` và `NoHolder` mở đường; `NotLapsed` và
 * `HolderChanged` không ghi gì nên người gọi từ chối ngay. `now` đã `toSecond(nowVN())`.
 */
export async function freeLapsedHold(
  slotHolds: Pick<SlotHoldService, 'expireLapsedHold'>,
  em: EntityManager,
  slot: LockedSlot,
  now: Date,
): Promise<LapsedHoldOutcome> {
  const expired = await slotHolds.expireLapsedHold(em, slot, { now });
  return expired.kind === 'Expired' || expired.kind === 'NoHolder'
    ? 'Free'
    : 'StillHeld';
}

/**
 * Giữ khung giờ SAU `INSERT lich_hen`: `ConTrong` → `DangGiuCho` (`giu_cho_den` = `den`), và khi `book` thì tiếp `DangGiuCho` → `DaDat`, `giu_cho_den` NULL (INV-03). `create` cọc > 0 dừng ở `DangGiuCho`
 * (`book: false`); `create` cọc 0đ và đổi lịch (cọc đã thu từ lịch gốc, không có hạn thanh toán) đặt luôn (`book: true`). Không `Done` dưới khoá là bất biến vỡ: NÉM `Error` để hoàn tác cả `INSERT`, không commit lịch mồ côi.
 */
export async function claimSlot(
  slotHolds: Pick<SlotHoldService, 'hold' | 'markBooked'>,
  em: EntityManager,
  slot: LockedSlot,
  input: { den: Date; book: boolean },
): Promise<void> {
  if ((await slotHolds.hold(em, slot, { den: input.den })).kind !== 'Done')
    throw new Error('hold không ghi được dưới khoá sau khi INSERT lich_hen');
  if (input.book && (await slotHolds.markBooked(em, slot)).kind !== 'Done')
    throw new Error('markBooked không ghi được dưới khoá');
}
