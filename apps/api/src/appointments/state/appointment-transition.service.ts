import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { toSecond } from '../../common/time/time.js';
import {
  isDeadlockError,
  isLockWaitTimeoutError,
} from '../../database/mysql-errors.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import {
  APPOINTMENT_NOTIFIER,
  type AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import { WAITLIST_PORT, type WaitlistPort } from '../ports/waitlist.port.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { lockSlot } from '../slots/slot-lock.js';
import {
  canTransition,
  type TransitionActor,
} from './appointment-state.matrix.js';
import {
  lockAppointment,
  markCancelled,
  type LockedAppointment,
} from './cancel-appointment.query.js';
import {
  completeWithin,
  type CompleteInput,
  type CompleteOutcome,
} from './complete-appointment.js';
import {
  confirmPaidWithin,
  type ConfirmPaidInput,
  type ConfirmPaidOutcome,
} from './confirm-paid.js';
import { cancelLapsedHold } from './lapsed-hold.js';
import { readLichHenKeys } from './lich-hen-keys.query.js';

// `AppointmentTransitionService`: NƠI DUY NHẤT đổi `lich_hen.trang_thai` của module booking (PLAN booking 5.2, 5.5, 5.10 D6; luật H7 và AR-06: `UPDATE lich_hen` chỉ ở `appointments/state/`).
// B9 dựng KHUNG và phương thức đầu tiên `expire`; B10 (`cancel`, đã làm) và B11 (`confirmPaid` do `payment` gọi, `complete` do `doctor` gọi, đã làm; thân ở `confirm-paid.ts` và `complete-appointment.ts`)
// đã thêm vào đúng lớp này; B12 (`checkIn`, `markNoShow`), B14 (override) thêm tiếp (TRACKING 3.19.1, 3.23, 3.24). Không dựng trước thứ chưa có người dùng.
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
// HAI HỌ phương thức trong MỘT lớp: (A) TỰ MỞ giao dịch (`expire`, `markNoShow`, override): vỏ ngoài `withBookingTransaction` + thân nhận `em`; (B) NHẬN `em` CỦA NGƯỜI GỌI
// và không mở giao dịch (`confirmPaid` trong giao dịch của `payment`, `complete` trong giao dịch của `doctor`, `checkIn`, `markReplaced`): chỉ có thân nhận `em`. Viết thân nhận `em` trước.
// `cancel` (B10) thuộc họ B: nó là phần GHI của huỷ (khoá, kiểm lại, ma trận, `UPDATE`, khung giờ); vỏ giao dịch, tính hoàn, thông báo và cổng sau commit nằm ở `AppointmentCancellationService`
// (`cancel/`), vì chúng cần ví, thanh toán và thông báo mà lớp ghi trạng thái này không nên tiêm (TRACKING 3.23 B10-D; chú thích cũ xếp `cancel` vào họ A).

// Kiểu của hai hàm gọi vào (B11): người gọi (`payment`, `doctor`) import cùng chỗ với lớp dịch vụ
export type { CompleteInput, CompleteOutcome } from './complete-appointment.js';
export type { ConfirmPaidInput, ConfirmPaidOutcome } from './confirm-paid.js';

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

/** Vai trò được huỷ qua `cancel` (đúng bốn người gọi của B10, B12, B14 và `doctor`): trùng khoá `CancelActor.kind` và tên vai trò trong ma trận. */
export type CancelWriteActor = Extract<
  TransitionActor,
  'BenhNhan' | 'LeTan' | 'QuanTriVien' | 'HeThong'
>;

export interface CancelWriteInput {
  lichHenId: string;
  /** Đọc thường từ trước khi khoá (cột bất biến): để khoá `khung_gio` TRƯỚC `lich_hen` */
  khungGioId: string;
  actor: CancelWriteActor;
  /** Phạm vi và sở hữu kiểm LẠI dưới khoá (5.3 quy tắc 2); `false` ⇒ `NotFound` (404 cùng thân), được hỏi TRƯỚC mọi kiểm tra trạng thái */
  canAct: (row: LockedAppointment) => boolean;
  /** `ly_do_huy` đã chuẩn hoá (`resolveCancelReason`) */
  lyDo: string;
  /** Mốc của lượt (đã `toSecond(nowVN())`): `thoi_diem_huy`; hàm KHÔNG tự đọc đồng hồ (H8) */
  now: Date;
}

export type CancelWriteOutcome =
  /** Lịch `DaHuy`, khung giờ `ConTrong`; `before` là hàng đọc dưới khoá TRƯỚC khi đổi (trạng thái nguồn, giờ hẹn, snapshot chính sách hoàn) */
  | { kind: 'Cancelled'; before: LockedAppointment }
  | { kind: 'NotFound' }
  /** Lịch đã `DaHuy` dưới khoá (người khác vừa huỷ, hoặc hết hạn): không ghi gì */
  | { kind: 'AlreadyCancelled' }
  /** Ma trận không cho `actor` đi từ trạng thái này sang `DaHuy` (HLH A1): không ghi gì */
  | { kind: 'NotCancellable'; trangThai: TrangThaiLichHen };

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
    @Inject(APPOINTMENT_NOTIFIER)
    private readonly notifier: AppointmentNotifier,
  ) {}

  /**
   * Xác nhận thanh toán (họ B, PLAN 5.5, Q4, Q20, H16): `payment` gọi TRONG giao dịch của nó. `ChoThanhToan` thành `DaXacNhan` và khung giờ `DangGiuCho` thành `DaDat`, ghi thông báo
   * `LichHenDaXacNhan`, tất cả trong `em` của người gọi; KHÔNG mở giao dịch, KHÔNG tự kiểm đồng hồ, KHÔNG bắt lỗi DB. Kết quả có kiểu (không ném `AppException`). Điều kiện người gọi phải giữ
   * (gọi TRƯỚC mọi ghi vào bảng có khoá ngoại tới `lich_hen`, chỉ gọi khi đã thu đủ cọc…): chú thích đầu `confirm-paid.ts`.
   */
  confirmPaid(
    em: EntityManager,
    input: ConfirmPaidInput,
  ): Promise<ConfirmPaidOutcome> {
    return confirmPaidWithin(em, input, {
      slotHolds: this.slotHolds,
      notifier: this.notifier,
    });
  }

  /**
   * Hoàn thành ca khám (họ B, PLAN 5.10 D6): `doctor` gọi trong giao dịch của nó; `DaTiepDon` thành `HoanThanh`, không đụng khung giờ. `HoanThanh` chỉ qua hàm này. Điều kiện người gọi phải giữ:
   * chú thích đầu `complete-appointment.ts`.
   */
  complete(em: EntityManager, input: CompleteInput): Promise<CompleteOutcome> {
    return completeWithin(em, input);
  }

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

  /**
   * Huỷ MỘT lịch (PLAN 5.6, HLH; họ B: nhận `em`, KHÔNG mở giao dịch, KHÔNG ném `AppException`). Chuỗi khoá (5.3): `khung_gio FOR UPDATE` (tầng 5) rồi `lich_hen FOR UPDATE` theo KHOÁ CHÍNH (tầng 6,
   * quy tắc 7; không bao giờ theo `khung_gio_id`: HL-18). Dưới khoá, theo thứ tự: phạm vi (`NotFound`) → `DaHuy` (`AlreadyCancelled`) → ma trận `canTransition` với trạng thái nguồn ĐỌC DƯỚI KHOÁ
   * (`NotCancellable`; khác `expire`, trạng thái nguồn ở đây đổi được và phụ thuộc `actor`: Quản trị viên đi được từ `DaTiepDon`, `VangMat`, Q24). Từ chối có kiểu xảy ra TRƯỚC lần ghi đầu tiên.
   * Sau đó `UPDATE` có điều kiện trạng thái nguồn rồi đặt khung giờ `ConTrong` bằng `SlotHoldService` (nơi DUY NHẤT ghi `khung_gio`). Lệch dữ liệu SAU lần ghi (khung giờ không còn đúng trạng thái dưới
   * khoá, `UPDATE` không trúng 1 hàng) NÉM `Error` để người gọi hoàn tác trọn, như `expire`. Không gọi cổng nào: tính hoàn, thông báo và cổng sau commit là việc của người gọi.
   */
  async cancel(
    em: EntityManager,
    input: CancelWriteInput,
  ): Promise<CancelWriteOutcome> {
    const slot = await lockSlot(em, input.khungGioId);
    if (slot === null)
      throw new Error(`khung giờ ${input.khungGioId} của lịch không tồn tại`);
    const row = await lockAppointment(em, input.lichHenId);
    if (row === null || !input.canAct(row)) return { kind: 'NotFound' };
    if (row.trangThai === 'DaHuy') return { kind: 'AlreadyCancelled' };
    const decision = canTransition({
      actor: input.actor,
      from: row.trangThai,
      to: 'DaHuy',
    });
    if (!decision.ok)
      return { kind: 'NotCancellable', trangThai: row.trangThai };

    const updated = await markCancelled(em, {
      lichHenId: input.lichHenId,
      from: row.trangThai,
      now: input.now,
      lyDo: input.lyDo,
    });
    if (!updated)
      throw new Error(
        `lịch ${input.lichHenId} không còn ${row.trangThai} dưới khoá khi huỷ`,
      );
    // Lịch chờ thanh toán giữ khung giờ `DangGiuCho` với hạn đúng bằng `giu_cho_den` (INV-2); các trạng thái còn lại giữ `DaDat` (INV-3). `Stale` là dữ liệu lệch: hoàn tác.
    const released = await this.slotHolds.release(
      em,
      slot,
      row.trangThai === 'ChoThanhToan'
        ? { from: 'DangGiuCho', den: slot.giuChoDen }
        : { from: 'DaDat', den: null },
    );
    if (released.kind !== 'Done')
      throw new Error(
        `khung giờ ${slot.khungGioId} không đúng trạng thái giữ lịch ${row.trangThai} dưới khoá khi huỷ`,
      );
    return { kind: 'Cancelled', before: row };
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
