import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { toSecond } from '../../common/time/time.js';
import { cancelLapsedHold } from '../state/lapsed-hold.js';
import { isLapsedHold } from './bookability.rules.js';
import { lockSlot, type LockedSlot } from './slot-lock.js';

// `SlotHoldService`: NƠI DUY NHẤT ghi `khung_gio` của module booking (PLAN booking 5.2, 5.5, 5.10 W3; TRACKING 3.14 B6-B, B6-F; luật AR-06 và CG-10: `UPDATE khung_gio` chỉ ở `appointments/slots/`).
// Mọi hàm nhận `em` của NGƯỜI GỌI và KHÔNG mở giao dịch (khoá `benh_nhan`, `ho_so_nguoi_than` do người gọi xin trước), KHÔNG ném `AppException` (trả KẾT QUẢ CÓ KIỂU; người gọi đổi sang lỗi API sau commit).
// Các hàm ghi nhận `LockedSlot`, bằng chứng đã khoá `khung_gio FOR UPDATE` (chỉ `lockSlot` tạo được, `tsc` từ chối đối tượng dựng tay). Mọi `UPDATE` có điều kiện trạng thái trong chính câu lệnh:
// đúng 1 hàng bị ảnh hưởng ⇒ `Done`, 0 hàng ⇒ `Stale` và không đổi gì. Mọi mốc qua `toSecond` (M4); không `NOW()` (AR-04): người gọi truyền mốc.

export type SlotWriteOutcome = { kind: 'Done' } | { kind: 'Stale' };

/** Lời mời danh sách chờ giữ khung giờ tới `den` (PLAN 5.10 W3). */
export interface InvitationHoldInput {
  khungGioId: string;
  den: Date;
}

export type InvitationHoldOutcome = SlotWriteOutcome | { kind: 'NotFound' };

export type ExpireLapsedHoldOutcome =
  /** Lịch cũ đã `DaHuy` và khung giờ đã `ConTrong` (cùng giao dịch của người gọi) */
  | { kind: 'Expired'; lichHenId: string }
  /** Khung giờ hết hạn nhưng không có lịch giữ (lời mời danh sách chờ hết hạn): khung giờ đã `ConTrong` */
  | { kind: 'NoHolder' }
  /** Khung giờ chưa hết hạn, hoặc lịch giữ nó chưa tới hạn: không ghi gì */
  | { kind: 'NotLapsed' }
  /** Lịch giữ không còn `ChoThanhToan` dưới khoá: không ghi gì */
  | { kind: 'HolderChanged' };

const HOLD_SQL = `UPDATE khung_gio SET trang_thai = 'DangGiuCho', giu_cho_den = ?
WHERE khung_gio_id = ? AND trang_thai = 'ConTrong'`;

const MARK_BOOKED_SQL = `UPDATE khung_gio SET trang_thai = 'DaDat', giu_cho_den = NULL
WHERE khung_gio_id = ? AND trang_thai = 'DangGiuCho'`;

// `<=>` để `DaDat` với `den = null` khớp `giu_cho_den IS NULL`; `giu_cho_den` lệch (người khác vừa giữ lại) ⇒ 0 hàng (CG-09: không thả nhầm).
const RELEASE_SQL = `UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL
WHERE khung_gio_id = ? AND trang_thai = ? AND giu_cho_den <=> ?`;

// Đọc THƯỜNG lịch đang giữ khung giờ, dưới khoá khung giờ (không `FOR UPDATE`: khoá `lich_hen` chỉ theo khoá chính, PLAN 5.3 quy tắc 7, AR-05; đã chốt bằng ca đo B6b).
const FIND_HOLDER_SQL = `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId
FROM lich_hen WHERE khung_gio_dang_giu = ?`;

const affected = async (
  em: EntityManager,
  sql: string,
  params: unknown[],
): Promise<SlotWriteOutcome> => {
  const result: { affectedRows?: number } = await em.query(sql, params);
  return result.affectedRows === 1 ? { kind: 'Done' } : { kind: 'Stale' };
};

/**
 * Hạn giữ chỗ: `toSecond(now)` cộng `phut` phút. MỘT hàm cho CẢ `khung_gio.giu_cho_den` và `lich_hen.han_thanh_toan` (INV-02 đòi hai giá trị bằng nhau, nên B8 không tự cộng hai lần).
 * `phut` là `thoi_gian_giu_cho` của cấu hình (số nguyên không âm).
 */
export function holdDeadline(now: Date, phut: number): Date {
  if (!Number.isSafeInteger(phut) || phut < 0)
    throw new RangeError('phut phải là số nguyên không âm');
  return new Date(toSecond(now).getTime() + phut * 60_000);
}

@Injectable()
export class SlotHoldService {
  /** `ConTrong` → `DangGiuCho` với `giu_cho_den = den`. `Stale` nếu khung giờ không còn `ConTrong` (người khác đã giữ hay đặt). */
  hold(
    em: EntityManager,
    slot: LockedSlot,
    input: { den: Date },
  ): Promise<SlotWriteOutcome> {
    return affected(em, HOLD_SQL, [toSecond(input.den), slot.khungGioId]);
  }

  /** `DangGiuCho` → `DaDat`, `giu_cho_den` NULL (INV-03). `Stale` nếu khung giờ không còn `DangGiuCho`. */
  markBooked(em: EntityManager, slot: LockedSlot): Promise<SlotWriteOutcome> {
    return affected(em, MARK_BOOKED_SQL, [slot.khungGioId]);
  }

  /**
   * → `ConTrong`, `giu_cho_den` NULL, CHỈ khi khung giờ đúng là `from` và `giu_cho_den` đúng là `den` (CG-09). `DaDat` đi với `den = null`; `DangGiuCho` đi với hạn đã đặt.
   * Không khớp ⇒ `Stale` (không thả nhầm khung giờ người khác vừa giữ lại).
   */
  release(
    em: EntityManager,
    slot: LockedSlot,
    input: { from: 'DaDat' | 'DangGiuCho'; den: Date | null },
  ): Promise<SlotWriteOutcome> {
    return affected(em, RELEASE_SQL, [
      slot.khungGioId,
      input.from,
      input.den === null ? null : toSecond(input.den),
    ]);
  }

  /**
   * Hết hạn lười (PLAN 5.5): khung giờ `DangGiuCho` có `giu_cho_den <= now` được coi là trống; ghi hết hạn của lịch cũ VÀ đặt khung giờ `ConTrong` trong MỘT giao dịch (của người gọi).
   * Chuỗi khoá (đã chốt bằng ca đo B6b, P): người gọi đã khoá `khung_gio`; hàm đọc THƯỜNG `lich_hen_id` của lịch giữ nó rồi `cancelLapsedHold` khoá lịch THEO KHOÁ CHÍNH và kiểm lại dưới khoá.
   * Người gọi (B8) gọi hàm này khi `evaluateBookability` trả `lapsedHold` khác `null` (kể cả khi `lichHenId` là `null`), TRƯỚC `INSERT lich_hen`; chỉ `Expired` và `NoHolder` mở đường cho lần đặt.
   * Nếu lịch cũ đã huỷ mà khung giờ không còn `DangGiuCho` đúng hạn cũ (không thể xảy ra dưới khoá) thì NÉM `Error` (không phải `AppException`) để hoàn tác cả hai thay vì commit nửa chừng.
   */
  async expireLapsedHold(
    em: EntityManager,
    slot: LockedSlot,
    input: { now: Date },
  ): Promise<ExpireLapsedHoldOutcome> {
    const now = toSecond(input.now);
    if (!isLapsedHold(slot, now)) return { kind: 'NotLapsed' };

    const holders = await em.query<{ lichHenId: string }[]>(FIND_HOLDER_SQL, [
      slot.khungGioId,
    ]);
    const holder = holders[0];
    if (holder === undefined) {
      await this.releaseLapsed(em, slot);
      return { kind: 'NoHolder' };
    }

    const cancelled = await cancelLapsedHold(em, {
      lichHenId: holder.lichHenId,
      now,
    });
    if (cancelled.kind !== 'Cancelled') return { kind: cancelled.kind };
    await this.releaseLapsed(em, slot);
    return { kind: 'Expired', lichHenId: holder.lichHenId };
  }

  /**
   * Giữ khung giờ cho một LỜI MỜI danh sách chờ (PLAN 5.10 W3): tự xin tầng 5 (`khung_gio FOR UPDATE`), chỉ nhận khung giờ `ConTrong` (không có `now`: `waitlist` tự quyết khung giờ còn ở
   * tương lai, TRACKING 3.14 câu (k)). Không tạo lịch hẹn. `Stale` nếu không còn `ConTrong`; `NotFound` nếu khung giờ không tồn tại.
   */
  holdForInvitation(
    em: EntityManager,
    input: InvitationHoldInput,
  ): Promise<InvitationHoldOutcome> {
    return this.withInvitationSlot(em, input, (slot) =>
      this.hold(em, slot, { den: input.den }),
    );
  }

  /** Thả khung giờ giữ cho lời mời, CÓ ĐIỀU KIỆN `giu_cho_den = den` (CG-09, W3): khung giờ đã bị người khác giữ lại thì `Stale`, không thả nhầm. Tự xin tầng 5. */
  releaseInvitationHold(
    em: EntityManager,
    input: InvitationHoldInput,
  ): Promise<InvitationHoldOutcome> {
    return this.withInvitationSlot(em, input, (slot) =>
      this.release(em, slot, { from: 'DangGiuCho', den: input.den }),
    );
  }

  // Hai hàm cho lời mời đều tự xin tầng 5 trước khi ghi: MỘT chỗ khoá, không có khung giờ ⇒ `NotFound`.
  private async withInvitationSlot(
    em: EntityManager,
    input: InvitationHoldInput,
    write: (slot: LockedSlot) => Promise<SlotWriteOutcome>,
  ): Promise<InvitationHoldOutcome> {
    const slot = await lockSlot(em, input.khungGioId);
    return slot === null ? { kind: 'NotFound' } : write(slot);
  }

  /**
   * Đặt lại khung giờ hết hạn về `ConTrong` đúng với hạn đã đọc dưới khoá; không thể `Stale` dưới khoá, nếu có thì hoàn tác (ném `Error`).
   * CÔNG KHAI từ B9: `AppointmentTransitionService.expire` (job, đã biết lịch) gọi đúng hàm này sau `cancelLapsedHold`, cùng đường với `expireLapsedHold` (B8, tìm lịch theo khung giờ),
   * để "thả khung giờ sau khi huỷ lịch hết hạn" chỉ có MỘT bản logic.
   */
  async releaseLapsed(em: EntityManager, slot: LockedSlot): Promise<void> {
    const released = await this.release(em, slot, {
      from: 'DangGiuCho',
      den: slot.giuChoDen,
    });
    if (released.kind !== 'Done')
      throw new Error(
        `khung giờ ${slot.khungGioId} không còn DangGiuCho đúng hạn dưới khoá khi hết hạn lười`,
      );
  }
}
