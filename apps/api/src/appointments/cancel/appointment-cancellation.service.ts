import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import { toCents } from '../../pricing/money.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import {
  APPOINTMENT_NOTIFIER,
  type AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import {
  PAYMENT_SUMMARY_PORT,
  type PaymentSummaryPort,
} from '../ports/payment.port.js';
import { REFUND_PORT, type RefundPort } from '../ports/wallet.port.js';
import { WAITLIST_PORT, type WaitlistPort } from '../ports/waitlist.port.js';
import {
  AppointmentTransitionService,
  errorNameOf,
  type CancelWriteOutcome,
} from '../state/appointment-transition.service.js';
import { readLichHenKeysByCode } from '../state/lich-hen-keys.query.js';
import { resolveCancelReason } from './cancel-reason.js';
import { isInCancelScope } from './cancel-scope.js';
import type {
  CancelInput,
  CancelOutcome,
  CancelReason,
  RefundAmount,
} from './cancel.types.js';
import { calculateRefund, refundPolicyOf } from './refund-calculator.js';

// `AppointmentCancellationService`: MỘT nơi huỷ lịch hẹn cho BỐN người gọi (Bệnh nhân B10, Lễ tân B12, Quản trị viên B14, `doctor` duyệt nghỉ phép B15 đến B17; PLAN booking 5.6, 5.10 D5, H4, H9;
// TRACKING 3.23 B10-C, B10-D, B10-F). Điều phối: một mốc `now`, giao dịch riêng (KHÔNG nhận `em` của người gọi vì thứ tự khoá 5.3), phạm vi theo actor, tính hoàn, thông báo; sau commit thì cổng
// hoàn tiền và danh sách chờ. PHẦN GHI (khoá, kiểm lại, ma trận, `UPDATE lich_hen`, khung giờ) là `AppointmentTransitionService.cancel`.
//
// Hợp đồng đầu vào, đầu ra: `cancel/cancel.types.ts`. Kết quả nghiệp vụ là giá trị trả về; lỗi hệ thống thì NÉM (503 `HE_THONG_DANG_BAN` khi hết lượt thử lại; `Error` khi dữ liệu hỏng, giao dịch đã hoàn tác trọn).

const CANCEL_LABEL = 'cancel-appointment';

/** Kết quả của THÂN giao dịch: như `CancelOutcome` nhưng `Cancelled` còn mang dữ kiện cho bước SAU commit (cổng hoàn tiền, danh sách chờ). */
type CancelWork =
  | {
      kind: 'Cancelled';
      lichHenId: string;
      khungGioId: string;
      maLichHen: string;
      /** `lich_hen.thoi_gian`: quyết định có mời danh sách chờ không */
      thoiGian: Date;
      hoanCoc: RefundAmount | null;
    }
  | Exclude<CancelWriteOutcome, { kind: 'Cancelled' }>;

@Injectable()
export class AppointmentCancellationService {
  private readonly logger = new Logger(AppointmentCancellationService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AppointmentTransitionService)
    private readonly transition: AppointmentTransitionService,
    @Inject(BranchAccessPolicy) private readonly branches: BranchAccessPolicy,
    @Inject(PAYMENT_SUMMARY_PORT) private readonly payments: PaymentSummaryPort,
    @Inject(REFUND_PORT) private readonly refunds: RefundPort,
    @Inject(WAITLIST_PORT) private readonly waitlist: WaitlistPort,
    @Inject(APPOINTMENT_NOTIFIER)
    private readonly notifier: AppointmentNotifier,
  ) {}

  /**
   * Huỷ lịch `input.maLichHen` (kết quả có kiểu; xem `CancelOutcome`). Thứ tự: (1) `lyDo` hợp lệ (lỗi lập trình ném TRƯỚC khi mở giao dịch); (2) MỘT mốc `now = toSecond(nowVN())` cho cả lượt: `thoi_diem_huy`,
   * bậc hoàn và quyết định mời danh sách chờ; (3) giao dịch `withBookingTransaction` (READ COMMITTED, thử lại 1213/1205 chạy lại THÂN từ đầu: thân không giữ trạng thái); (4) SAU commit, đúng một lần: hoàn cọc
   * rồi mời danh sách chờ, lỗi của mỗi cổng chỉ ghi log và KHÔNG đổi kết quả (HLH A3, HL-11). `AlreadyCancelled`, `NotCancellable`, `NotFound` trả về TRƯỚC mọi cổng nên hai lần huỷ đồng thời chỉ hoàn tiền và
   * mời chờ MỘT lần (DT-07, HL-06).
   */
  async cancel(input: CancelInput): Promise<CancelOutcome> {
    const lyDo = resolveCancelReason(input);
    const now = toSecond(nowVN());
    const work = await withBookingTransaction(
      this.db,
      (em) => this.cancelWithin(em, input, lyDo, now),
      { label: CANCEL_LABEL },
    );
    if (work.kind !== 'Cancelled') return work;
    await this.refundDeposit(work, lyDo);
    await this.inviteWaitlist(work, input.reason, now);
    return {
      kind: 'Cancelled',
      maLichHen: work.maLichHen,
      hoanCoc: work.hoanCoc,
    };
  }

  // Thân giao dịch (họ A: nhận `em` của vỏ). Có thể chạy lại từ đầu: không giữ trạng thái, không tác dụng phụ ngoài `em` (thông báo ghi bằng `em`, hoàn tác cùng giao dịch).
  // Từ chối có kiểu TRƯỚC lần ghi đầu tiên; lỗi SAU lần ghi (đọc tiền đã thu, tính hoàn trên snapshot hỏng, thông báo, khung giờ lệch) NÉM để hoàn tác trọn (HL-16).
  private async cancelWithin(
    em: EntityManager,
    input: CancelInput,
    lyDo: string,
    now: Date,
  ): Promise<CancelWork> {
    const keys = await readLichHenKeysByCode(em, input.maLichHen);
    if (keys === null || !isInCancelScope(input.actor, keys, this.branches))
      return { kind: 'NotFound' };

    const written = await this.transition.cancel(em, {
      lichHenId: keys.lichHenId,
      khungGioId: keys.khungGioId,
      actor: input.actor.kind,
      canAct: (row) => isInCancelScope(input.actor, row, this.branches),
      lyDo,
      now,
    });
    if (written.kind !== 'Cancelled') return written;

    // Đọc tiền đã thu DƯỚI khoá lịch (tầng 6 trước tầng 7): `payment` thật muốn xác nhận thanh toán thì phải khoá lịch trước, nên không đua với lần huỷ này
    const daThu = await this.payments.amountPaid(em, keys.lichHenId);
    const refund = calculateRefund({
      policy: refundPolicyOf(input.reason),
      snapshot: written.before.chinhSachHoan,
      thoiGian: written.before.thoiGian,
      now,
      daThu,
    });
    const hoanCoc =
      refund === null ? null : { tyLe: refund.tyLe, soTien: refund.soTien };
    await this.notifier.notify(em, {
      loaiSuKien: BOOKING_NOTIFICATION_EVENTS.CANCELLED,
      lichHenId: keys.lichHenId,
      taiKhoanId: written.before.benhNhanId,
      huy: { reason: input.reason, hoanCoc },
    });
    return {
      kind: 'Cancelled',
      lichHenId: keys.lichHenId,
      khungGioId: keys.khungGioId,
      maLichHen: keys.maLichHen,
      thoiGian: written.before.thoiGian,
      hoanCoc,
    };
  }

  // Sau commit. CHỈ khi số hoàn > 0 (lịch cọc 0đ, chưa thu hay ngoài mọi bậc thì không có gì để hoàn). MỘT lần: thử lại 3 lần cách 5 phút rồi giao Quản trị viên là việc của `wallet` (B17), không phải ở đây.
  // Cổng ném hay trả `Failed` ⇒ lịch đã `DaHuy` thật nên chỉ ghi log: chỉ id nội bộ và TÊN lớp lỗi (không `message`, không mã lịch hẹn, không số tiền).
  private async refundDeposit(
    work: Extract<CancelWork, { kind: 'Cancelled' }>,
    lyDo: string,
  ): Promise<void> {
    if (work.hoanCoc === null || toCents(work.hoanCoc.soTien) === 0n) return;
    try {
      const result = await this.refunds.refund({
        lichHenId: work.lichHenId,
        soTien: work.hoanCoc.soTien,
        lyDo,
      });
      if (result.kind === 'Failed')
        this.logger.error(
          `Hoàn cọc của lịch hẹn ${work.lichHenId} thất bại (cổng trả Failed)`,
        );
    } catch (error) {
      this.logger.error(
        `Không hoàn được cọc của lịch hẹn ${work.lichHenId}: ${errorNameOf(error)}`,
      );
    }
  }

  // Sau commit. Không mời khi bác sĩ nghỉ phép (Q17: cả ngày đó không còn bác sĩ) và khi giờ hẹn đã tới hay qua (như Q5 và `expire`). Cổng ném chỉ ghi log (TECH_DEBT dòng 101: không thử lại).
  private async inviteWaitlist(
    work: Extract<CancelWork, { kind: 'Cancelled' }>,
    reason: CancelReason,
    now: Date,
  ): Promise<void> {
    if (reason === 'BacSiNghiPhep') return;
    if (work.thoiGian.getTime() <= now.getTime()) return;
    try {
      await this.waitlist.onSlotReleased(work.khungGioId);
    } catch (error) {
      this.logger.error(
        `Không báo được danh sách chờ về khung giờ ${work.khungGioId} vừa trống: ${errorNameOf(error)}`,
      );
    }
  }
}
