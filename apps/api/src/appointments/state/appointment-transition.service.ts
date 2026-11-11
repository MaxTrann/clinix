import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { toSecond } from '../../common/time/time.js';
import {
  isDeadlockError,
  isLockWaitTimeoutError,
} from '../../database/mysql-errors.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { WAITLIST_PORT, type WaitlistPort } from '../ports/waitlist.port.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { lockSlot } from '../slots/slot-lock.js';
import { cancelLapsedHold } from './lapsed-hold.js';
import { readLichHenKeys } from './lich-hen-keys.query.js';

// `AppointmentTransitionService`: NƠI DUY NHẤT đổi `lich_hen.trang_thai` của module booking (PLAN booking 5.2, 5.5, 5.10 D6; luật H7 và AR-06: `UPDATE lich_hen` chỉ ở `appointments/state/`).
// B9 dựng KHUNG và phương thức đầu tiên `expire`; B10 (`cancel`), B11 (`confirmPaid`, `complete`), B12 (`checkIn`, `markNoShow`), B14 (override) THÊM phương thức vào đúng lớp này
// (TRACKING 3.19.1). Chưa có phương thức nào ngoài `expire`: không dựng trước thứ chưa có người dùng.
//
// KHUÔN BẢY BƯỚC của mọi phương thức:
//  1. ĐỌC THƯỜNG các khoá bất biến của lịch (`readLichHenKeys`: `khung_gio_id`, sau này thêm `benh_nhan_id`…), chưa khoá gì.
//  2. KHOÁ theo thứ tự 5.3 (`locking/lock-order.ts`): tầng 2 và 4 chỉ khi luồng cần (hết hạn KHÔNG cần `bac_si`), rồi `khung_gio` (`lockSlot`, tầng 5), rồi `lich_hen`
//     THEO KHOÁ CHÍNH (tầng 6, quy tắc 7; KHÔNG BAO GIỜ theo `khung_gio_id`).
//  3. KIỂM LẠI trạng thái, sở hữu và điều kiện thời gian DƯỚI KHOÁ (bản đọc ở bước 1 chỉ để biết khoá gì).
//  4. ĐỐI CHIẾU ma trận `canTransition` với trạng thái nguồn đọc dưới khoá (nơi trạng thái nguồn thay đổi được: huỷ, override…). `expire` không gọi lúc chạy: ô
//     `HeThong ChoThanhToan → DaHuy` là hằng, nhánh từ chối không bao giờ chạy tới; TRX-01 khẳng định ô đó có trong ma trận.
//  5. `UPDATE` CÓ ĐIỀU KIỆN trạng thái nguồn (đúng 1 hàng), cùng thao tác khung giờ (`SlotHoldService`, nơi DUY NHẤT ghi `khung_gio`).
//  6. Trả KẾT QUẢ CÓ KIỂU, KHÔNG ném `AppException` trong giao dịch (ném thì lần ghi đã làm bị hoàn tác theo, bài học A8).
//  7. Tác dụng phụ (cổng sang module khác) SAU commit, ĐÚNG MỘT LẦN; lỗi cổng không đổi kết quả đã commit. `withBookingTransaction` có thể CHẠY LẠI thân từ đầu (1213, 1205),
//     nên không gọi cổng trong thân.
//
// HAI HỌ phương thức trong MỘT lớp: (A) TỰ MỞ giao dịch (`expire`, `cancel`, `markNoShow`, override): vỏ ngoài `withBookingTransaction` + thân nhận `em`; (B) NHẬN `em` CỦA NGƯỜI GỌI
// và không mở giao dịch (`confirmPaid` trong giao dịch của `payment`, `complete` trong giao dịch của `doctor`, `checkIn`, `markReplaced`): chỉ có thân nhận `em`. Viết thân nhận `em` trước.

export type ExpireNotDueReason =
  /** Không có hàng `lich_hen` đó */
  | 'NotFound'
  /** Không còn `ChoThanhToan` dưới khoá (đã thanh toán, đã huỷ giữa chừng) */
  | 'NotPending'
  /** Còn `ChoThanhToan` nhưng `han_thanh_toan > now` (hoặc không có hạn): chưa tới lúc */
  | 'NotLapsed';

export type ExpireOutcome =
  /** Lịch `DaHuy` (`thoi_diem_huy` = `now`, `ly_do_huy` = `HOLD_EXPIRED_CANCEL_REASON`), khung giờ `ConTrong`; đã commit */
  | { kind: 'Expired'; khungGioId: string }
  | { kind: 'NotDue'; reason: ExpireNotDueReason }
  /**
   * Không hết hạn được và giao dịch đã hoàn tác trọn. `Busy`: hết lượt thử lại 1213/1205 (503 `HE_THONG_DANG_BAN`) hoặc lỗi tranh chấp lúc commit; `Error`: lỗi khác, kể cả dữ liệu lệch.
   * `errorName` chỉ là TÊN LỚP lỗi (không `message`: thông điệp lỗi của driver có thể mang dữ liệu người dùng) để người gọi ghi log.
   */
  | { kind: 'Failed'; reason: 'Busy' | 'Error'; errorName: string };

export interface ExpireInput {
  lichHenId: string;
  /** Mốc của lượt (người gọi đã `toSecond(nowVN())`); hàm KHÔNG tự đọc đồng hồ (H8) */
  now: Date;
}

// Kết quả của THÂN giao dịch: như `ExpireOutcome` nhưng `Expired` còn mang `ngayGio` (đọc dưới khoá) để quyết định có báo danh sách chờ SAU commit không.
type ExpireWork =
  | { kind: 'Expired'; khungGioId: string; ngayGio: Date }
  | Extract<ExpireOutcome, { kind: 'NotDue' }>;

const EXPIRE_LABEL = 'expire-hold';

/** Tên lớp lỗi để ghi log; không bao giờ dùng `message`: thông điệp lỗi của DB/driver có thể mang dữ liệu người dùng. */
export const errorNameOf = (error: unknown): string =>
  error instanceof Error ? error.name : 'LoiKhongRo';

// Tranh chấp khoá chỉ là tạm thời (`Busy`): `withBookingTransaction` đã ném 503 sau khi hết lượt thử lại; 1213 hay 1205 thô chỉ lọt ra khi lỗi đến lúc COMMIT.
function failureOf(error: unknown): Extract<ExpireOutcome, { kind: 'Failed' }> {
  const busy =
    (error instanceof AppException &&
      error.maLoi === BOOKING_ERROR_CODES.SYSTEM_BUSY) ||
    isDeadlockError(error) ||
    isLockWaitTimeoutError(error);
  return {
    kind: 'Failed',
    reason: busy ? 'Busy' : 'Error',
    errorName: errorNameOf(error),
  };
}

@Injectable()
export class AppointmentTransitionService {
  private readonly logger = new Logger(AppointmentTransitionService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(SlotHoldService) private readonly slotHolds: SlotHoldService,
    @Inject(WAITLIST_PORT) private readonly waitlist: WaitlistPort,
  ) {}

  /**
   * Hết hạn giữ chỗ MỘT lịch (PLAN 5.5, ĐLK b19, A5): `ChoThanhToan` mà `han_thanh_toan <= now` thành `DaHuy` (`ly_do_huy` = hằng, Q6) và khung giờ thành `ConTrong`, trong MỘT giao dịch.
   * Chuỗi khoá: đọc thường `khung_gio_id` của lịch, `khung_gio FOR UPDATE` (tầng 5), `lich_hen FOR UPDATE` theo khoá chính (tầng 6) và kiểm LẠI trạng thái và hạn dưới khoá (hai bản API cùng chạy job
   * vẫn đúng: bên sau thấy `NotDue`). Không xin `bac_si` (tầng 4 chỉ cho luồng tạo lịch): hết hạn chỉ thả chỗ. Sau commit, `WaitlistPort.onSlotReleased` đúng một lần và CHỈ khi khung giờ còn ở
   * tương lai (`ngayGio > now`); KHÔNG gửi thông báo (Q6). KHÔNG BAO GIỜ ném: mọi lỗi thành `Failed`, giao dịch đã hoàn tác trọn và lượt sau thử lại.
   */
  async expire(input: ExpireInput): Promise<ExpireOutcome> {
    const now = toSecond(input.now);
    let work: ExpireWork;
    try {
      work = await withBookingTransaction(
        this.db,
        (em) => this.expireWithin(em, input.lichHenId, now),
        { label: EXPIRE_LABEL },
      );
    } catch (error) {
      return failureOf(error);
    }
    if (work.kind !== 'Expired') return work;
    await this.notifyWaitlist(work.khungGioId, work.ngayGio, now);
    return { kind: 'Expired', khungGioId: work.khungGioId };
  }

  // Thân của `expire` (họ A: nhận `em` của vỏ `withBookingTransaction`). Có thể chạy lại từ đầu: không giữ trạng thái, không tác dụng phụ.
  private async expireWithin(
    em: EntityManager,
    lichHenId: string,
    now: Date,
  ): Promise<ExpireWork> {
    const keys = await readLichHenKeys(em, lichHenId);
    if (keys === null) return { kind: 'NotDue', reason: 'NotFound' };
    const slot = await lockSlot(em, keys.khungGioId);
    // Khoá ngoại `lich_hen.khung_gio_id` không cho xoá khung giờ còn lịch tham chiếu: không có khung giờ là dữ liệu hỏng, hoàn tác và báo `Failed`
    if (slot === null)
      throw new Error(`khung giờ ${keys.khungGioId} của lịch không tồn tại`);

    const cancelled = await cancelLapsedHold(em, { lichHenId, now });
    if (cancelled.kind === 'NotLapsed')
      return { kind: 'NotDue', reason: 'NotLapsed' };
    if (cancelled.kind === 'HolderChanged')
      return { kind: 'NotDue', reason: 'NotPending' };

    // Đã huỷ lịch dưới khoá: thả khung giờ trong CÙNG giao dịch. Khung giờ không còn `DangGiuCho` đúng hạn (dữ liệu lệch) thì hàm này ném `Error` để hoàn tác cả hai.
    await this.slotHolds.releaseLapsed(em, slot);
    return {
      kind: 'Expired',
      khungGioId: slot.khungGioId,
      ngayGio: slot.ngayGio,
    };
  }

  // Sau commit. Khung giờ đã qua (giờ hẹn <= now, như Q5) thì không báo (HG-08); cổng lỗi KHÔNG đổi kết quả: lịch đã hết hạn thật, nên chỉ ghi log (id khung giờ không phải dữ liệu cá nhân).
  private async notifyWaitlist(
    khungGioId: string,
    ngayGio: Date,
    now: Date,
  ): Promise<void> {
    if (ngayGio.getTime() <= now.getTime()) return;
    try {
      await this.waitlist.onSlotReleased(khungGioId);
    } catch (error) {
      this.logger.error(
        `Không báo được danh sách chờ về khung giờ ${khungGioId} vừa trống: ${errorNameOf(error)}`,
      );
    }
  }
}
