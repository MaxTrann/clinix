import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import {
  BOOKING_ERROR_CODES,
  bookingException,
} from '../../appointments/appointments.constants.js';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { resolveReceptionBranch } from '../../appointments/reception-branch.js';
import { AppointmentTransitionService } from '../../appointments/state/appointment-transition.service.js';
import type { CheckInOutcome } from '../../appointments/state/check-in.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { addMoney, compareMoney } from '../../pricing/money.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { PaymentAbort } from '../payment-abort.js';
import {
  PAYMENT_ERROR_CODES,
  PAYMENT_ERROR_MESSAGES,
} from '../payment.constants.js';
import { PaymentChain } from '../ports/payment-chain.js';
import { PaymentSummaryReader } from '../ports/payment-summary.reader.js';
import type {
  CashPreview,
  CashReceipt,
  CollectCashResult,
} from './cash.dto.js';
import { CashRepository, type CashAppointmentRow } from './cash.repository.js';

/** Kết quả CÓ KIỂU của phần ghi. `NothingToCollect` và `AmountMismatch` chỉ đi ra bằng `PaymentAbort` vì phải hoàn tác cả `checkIn`. */
type CollectOutcome =
  | {
      kind: 'Collected';
      receipt: Omit<CashReceipt, 'nguoiThu'>;
      nguoiThu: string;
    }
  | {
      kind: 'Rejected';
      outcome: Exclude<CheckInOutcome, { kind: 'CheckedIn' }>;
    }
  | { kind: 'NothingToCollect' }
  | { kind: 'AmountMismatch'; conPhaiThu: string };

const ZERO = '0.00';

/**
 * Thu tiền mặt tại quầy và tiếp đón trong CÙNG giao dịch (payment B6; PLAN 5.7, E7; TTQ-01…TTQ-15, DTT-11, HDT-13, QTT-04, QTT-10).
 *
 * Thứ tự kiểm (dừng ở lỗi đầu tiên): vai trò 403 (guard) → DTO 400 → phạm vi Lễ tân 403 (tài khoản khoá, không có chi nhánh) → lịch không có hay NGOÀI chi nhánh của Lễ tân 404 cùng thân. Kiểm chi nhánh
 * TRƯỚC `checkIn` vì `checkIn` với `actor: 'ThanhToan'` KHÔNG kiểm chi nhánh (TTQ-03); `lich_hen.chi_nhanh_id` là snapshot bất biến nên đọc thường một lần là đủ, chi nhánh của Lễ tân đọc ở DB mỗi request.
 *
 * Trong `withBookingTransaction`: (1) `checkIn` (`actor: 'ThanhToan'`, khoá X hàng `lich_hen`) TRƯỚC mọi ghi (HDT-13); (2) số còn phải thu DƯỚI khoá lịch (`PaymentSummaryReader`, theo chuỗi đổi lịch): bằng 0 ⇒
 * `PaymentAbort` hoàn tác cả `checkIn` (`KHONG_CON_PHAI_THU`, không ghi dòng 0đ); khác số Lễ tân gửi ⇒ `PaymentAbort` (`SO_TIEN_KHONG_KHOP` kèm `conPhaiThu`, TTQ-07); (3) `INSERT giao_dich_thanh_toan` tiền mặt
 * vào LỊCH GỐC. Hai lần thu cùng lịch (bấm đúp, hai Lễ tân): bên sau chờ khoá lịch rồi thấy `DaTiepDon` ⇒ `InvalidState` (TTQ-06). Không thông báo Bác sĩ, không nhật ký (L18, TTQ-14).
 * Thân giao dịch có thể chạy lại (1213, 1205): mốc `now` và cấu hình đọc MỘT lần ngoài giao dịch, mọi số tính lại trong thân.
 */
@Injectable()
export class CashPaymentService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(CashRepository) private readonly repository: CashRepository,
    @Inject(ReceptionScopeService)
    private readonly scopes: ReceptionScopeService,
    @Inject(SystemConfigService) private readonly configs: SystemConfigService,
    @Inject(AppointmentTransitionService)
    private readonly transitions: AppointmentTransitionService,
    @Inject(PaymentSummaryReader)
    private readonly payments: PaymentSummaryReader,
    @Inject(PaymentChain) private readonly chain: PaymentChain,
  ) {}

  /**
   * Ba số của hộp "Thu tiền & tiếp đón" (payment F4; Figma `492:2`; TTQ-16…TTQ-18): CHỈ ĐỌC, không khoá, không giao dịch. Cùng thứ tự kiểm phạm vi với `collect` (403 phạm vi, 404 cùng thân).
   * Lịch không `DaXacNhan` ⇒ 409 `LICH_HEN_KHONG_CHO_THU_TIEN`; không còn phải thu ⇒ 409 `KHONG_CON_PHAI_THU` (cùng mã với `collect`). Không kiểm cửa sổ tiếp đón: `collect` kiểm dưới khoá
   * và trả `NGOAI_KHUNG_GIO_TIEP_DON` kèm `tu`, `den`. Số đọc ở đây có thể cũ đi ngay sau đó; `collect` tính lại dưới khoá (lệch ⇒ `SO_TIEN_KHONG_KHOP`).
   */
  async preview(accountId: string, maLichHen: string): Promise<CashPreview> {
    const row = await this.findInBranch(accountId, maLichHen);
    if (row.trangThai !== 'DaXacNhan')
      throw new AppException(409, PAYMENT_ERROR_CODES.NOT_COLLECTABLE, {
        thongBao: PAYMENT_ERROR_MESSAGES.LICH_HEN_KHONG_CHO_THU_TIEN,
        chiTiet: { trangThai: row.trangThai },
      });
    // `findPayment` tính đã thu và còn phải thu theo cả chuỗi đổi lịch (một chỗ, như `collect`); chỉ `null` khi không có lịch, đã loại ở trên
    const payment = await this.payments.findPayment(
      this.db.manager,
      row.lichHenId,
    );
    if (payment === null || compareMoney(payment.conPhaiThu, ZERO) <= 0)
      throw new AppException(409, PAYMENT_ERROR_CODES.NOTHING_TO_COLLECT, {
        thongBao: PAYMENT_ERROR_MESSAGES.KHONG_CON_PHAI_THU,
      });
    return {
      maLichHen,
      giaKham: row.giaSnapshot,
      daThanhToanTruoc: payment.daThu,
      thuTaiQuay: payment.conPhaiThu,
    };
  }

  async collect(
    accountId: string,
    maLichHen: string,
    soTien: string,
  ): Promise<CollectCashResult> {
    const row = await this.findInBranch(accountId, maLichHen);

    const now = toSecond(nowVN());
    const config = await this.configs.get();
    const outcome = await this.run(
      accountId,
      row.lichHenId,
      soTien,
      now,
      config,
    );
    switch (outcome.kind) {
      case 'Collected':
        return {
          maLichHen,
          trangThai: 'DaTiepDon',
          phieuThu: { ...outcome.receipt, nguoiThu: outcome.nguoiThu },
        };
      case 'Rejected':
        throw rejectionException(outcome.outcome);
      case 'NothingToCollect':
        throw new AppException(409, PAYMENT_ERROR_CODES.NOTHING_TO_COLLECT, {
          thongBao: PAYMENT_ERROR_MESSAGES.KHONG_CON_PHAI_THU,
        });
      case 'AmountMismatch':
        throw new AppException(409, PAYMENT_ERROR_CODES.AMOUNT_MISMATCH, {
          thongBao: PAYMENT_ERROR_MESSAGES.SO_TIEN_KHONG_KHOP,
          chiTiet: { conPhaiThu: outcome.conPhaiThu },
        });
    }
  }

  /** Phạm vi Lễ tân (403) rồi lịch theo mã; không có lịch và lịch ở chi nhánh khác: CÙNG một 404 (không lộ lịch tồn tại ở chi nhánh khác). */
  private async findInBranch(
    accountId: string,
    maLichHen: string,
  ): Promise<CashAppointmentRow> {
    const { chiNhanhId } = await resolveReceptionBranch(this.scopes, accountId);
    const row = await this.repository.findByCode(this.db.manager, maLichHen);
    if (row === null || row.chiNhanhId !== chiNhanhId)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return row;
  }

  /** Phần GHI, trong một giao dịch. Không tác dụng phụ ngoài DB (thân có thể chạy lại). */
  private async run(
    accountId: string,
    lichHenId: string,
    soTien: string,
    now: Date,
    config: Awaited<ReturnType<SystemConfigService['get']>>,
  ): Promise<CollectOutcome> {
    try {
      return await withBookingTransaction<CollectOutcome>(
        this.db,
        async (em) => {
          // (1) `checkIn` TRƯỚC mọi ghi: khoá X `lich_hen`, kiểm trạng thái, cấu hình và cửa sổ tiếp đón dưới khoá; CHỈ `actor: 'ThanhToan'` (QTT-09, TTQ-15)
          const checkIn = await this.transitions.checkIn(em, {
            lichHenId,
            now,
            config,
            actor: 'ThanhToan',
          });
          if (checkIn.kind !== 'CheckedIn')
            return { kind: 'Rejected', outcome: checkIn };

          // (2) Số còn phải thu DƯỚI khoá lịch (đã giữ X từ `checkIn`), tính theo cả chuỗi đổi lịch
          const remaining = await this.payments.remainingToCollect(
            em,
            lichHenId,
          );
          if (compareMoney(remaining, ZERO) <= 0)
            throw new PaymentAbort<CollectOutcome>({
              kind: 'NothingToCollect',
            });
          if (compareMoney(soTien, remaining) !== 0)
            throw new PaymentAbort<CollectOutcome>({
              kind: 'AmountMismatch',
              conPhaiThu: remaining,
            });
          const paidBefore = await this.payments.amountPaid(em, lichHenId);

          // (3) Ghi khoản tiền mặt vào LỊCH GỐC: đúng số máy chủ tính, người thu từ token
          const rootId = (await this.chain.rootOf(em, lichHenId)) ?? lichHenId;
          const soPhieu = await this.repository.insertCashPayment(em, {
            rootLichHenId: rootId,
            soTien: remaining,
            nguoiThuId: accountId,
            now,
          });
          return {
            kind: 'Collected',
            receipt: {
              soPhieu,
              // còn phải thu > 0 nên giá = đã thu trước + còn phải thu (đúng công thức của `PaymentSummaryReader`)
              giaKham: addMoney(paidBefore, remaining),
              daThanhToanTruoc: paidBefore,
              thuTaiQuay: remaining,
              thoiDiem: now.toISOString(),
            },
            nguoiThu: await this.repository.receptionistName(em, accountId),
          };
        },
        { label: 'collect-cash' },
      );
    } catch (error) {
      if (error instanceof PaymentAbort) return error.outcome as CollectOutcome;
      throw error;
    }
  }
}

/** Kết quả từ chối của `checkIn` (actor `ThanhToan`) ⇒ lỗi API. `OwedAmount` chỉ có với `LeTan` nên gặp ở đây là lỗi lập trình. */
function rejectionException(
  outcome: Exclude<CheckInOutcome, { kind: 'CheckedIn' }>,
): AppException {
  switch (outcome.kind) {
    case 'NotFound':
      return new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    case 'InvalidState':
      return new AppException(409, PAYMENT_ERROR_CODES.NOT_COLLECTABLE, {
        thongBao: PAYMENT_ERROR_MESSAGES.LICH_HEN_KHONG_CHO_THU_TIEN,
        chiTiet: { trangThai: outcome.trangThai },
      });
    case 'ConfigMissing':
      // Cùng mã và câu với route Lễ tân của booking (quy tắc 35)
      return new AppException(409, 'HE_THONG_CHUA_CAU_HINH', {
        thongBao: 'Hệ thống chưa được cấu hình.',
      });
    case 'OutsideWindow':
      return bookingException(BOOKING_ERROR_CODES.OUTSIDE_CHECK_IN_WINDOW, {
        tu: outcome.tu.toISOString(),
        den: outcome.den.toISOString(),
      });
    case 'OwedAmount':
      throw new Error(
        'checkIn với actor ThanhToan không bao giờ trả OwedAmount',
      );
  }
}
