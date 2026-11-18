import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { AppointmentTransitionService } from '../../appointments/state/appointment-transition.service.js';
import { isHoldExpiredCancellation } from '../../appointments/state/confirm-paid.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  compareMoney,
  fromCents,
  subtractMoney,
  toCents,
} from '../../pricing/money.js';
import { WalletBalanceReader } from '../../wallet/balance/wallet-balance.reader.js';
import {
  availableOf,
  WalletLedger,
} from '../../wallet/ledger/wallet-ledger.js';
import { WALLET_ERROR_CODES } from '../../wallet/wallet.constants.js';
import { PaymentAbort } from '../payment-abort.js';
import { PAYMENT_ERROR_CODES } from '../payment.constants.js';
import { PaymentChain } from '../ports/payment-chain.js';
import type { DepositPaymentResult, DepositPreview } from './deposit.dto.js';
import {
  DepositRepository,
  type DepositAppointmentRow,
} from './deposit.repository.js';

/** Kết quả CÓ KIỂU của phần ghi (trong giao dịch). `InsufficientBalance` chỉ đi ra bằng `PaymentAbort` vì phải hoàn tác cả `confirmPaid`. */
type PayOutcome =
  | { kind: 'Paid'; soDuKhaDung: string }
  | { kind: 'AlreadyPaid' }
  | { kind: 'HoldExpired' }
  | { kind: 'InvalidState'; trangThai: TrangThaiLichHen }
  | { kind: 'InsufficientBalance'; soDuKhaDung: string };

const ZERO = '0.00';
const money = (value: string): string => fromCents(toCents(value));

/**
 * Thanh toán cọc lịch hẹn bằng ví (payment B5; PLAN 5.5, E6; TLK-01…TLK-16, DTT-01…DTT-06, HDT-12). Chủ lịch CHỈ lấy từ access token; số tiền CHỈ từ `tien_coc_snapshot` của lịch.
 *
 * Luồng `pay` (khuôn E6):
 *  1. NGOÀI giao dịch, đọc thường lịch theo mã: sở hữu TRƯỚC trạng thái (lịch của người khác hay không có ⇒ cùng một 404). Chặn sớm các ca phổ biến (cọc 0đ, đã huỷ, sai trạng thái, thiếu số dư); trạng thái
 *     thật chỉ có nghĩa DƯỚI khoá nên bước 2 kiểm lại.
 *  2. TRONG `withBookingTransaction`: `confirmPaid` TRƯỚC mọi ghi bảng con của `lich_hen` và trước khoá ví (tầng 6 trước 7b; CFP-08, HDT-12). Chỉ khi `Confirmed`: khoá ví `FOR UPDATE`, KIỂM LẠI số khả dụng
 *     dưới khoá (thiếu ⇒ `PaymentAbort` hoàn tác cả `confirmPaid`: lịch vẫn `ChoThanhToan`, khung giờ vẫn `DangGiuCho`, không `thong_bao`), `INSERT giao_dich_thanh_toan`, rồi `WalletLedger.debit`.
 *  3. Idempotent THEO TRẠNG THÁI LỊCH dưới khoá, không cần khoá chống lặp ở thân: lần hai `confirmPaid` trả `AlreadyConfirmed` ⇒ `200 daXuLyTruocDo`, không trừ lần hai.
 * Lịch quá `han_thanh_toan` nhưng chưa bị job quét vẫn được xác nhận (Q4 booking, TLK-08): service KHÔNG tự kiểm đồng hồ. Thư xác nhận do `confirmPaid` ghi sẵn; payment không gửi thư thứ hai.
 */
@Injectable()
export class DepositPaymentService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(DepositRepository) private readonly repository: DepositRepository,
    @Inject(AppointmentTransitionService)
    private readonly transitions: AppointmentTransitionService,
    @Inject(WalletLedger) private readonly ledger: WalletLedger,
    @Inject(WalletBalanceReader) private readonly balance: WalletBalanceReader,
    @Inject(PaymentChain) private readonly chain: PaymentChain,
  ) {}

  /** Lịch của CHÍNH người gọi, hoặc 404 `KHONG_TIM_THAY` (cùng thân cho "không có" và "của người khác"; QTT-02). */
  private async ownAppointment(
    accountId: string,
    maLichHen: string,
  ): Promise<DepositAppointmentRow> {
    const row = await this.repository.findByCode(this.db.manager, maLichHen);
    if (row === null || row.benhNhanId !== accountId)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return row;
  }

  /** Chặn sớm theo bản đọc thường. `allowConfirmed`: `pay` cho `DaXacNhan` đi tiếp để `confirmPaid` trả `AlreadyConfirmed` (idempotent); `preview` thì không. */
  private assertPayable(
    row: DepositAppointmentRow,
    allowConfirmed: boolean,
  ): void {
    if (compareMoney(row.tienCoc, ZERO) <= 0)
      throw new AppException(409, PAYMENT_ERROR_CODES.NO_DEPOSIT_REQUIRED);
    if (isHoldExpiredCancellation(row))
      throw new AppException(409, PAYMENT_ERROR_CODES.HOLD_EXPIRED);
    const ok =
      row.trangThai === 'ChoThanhToan' ||
      (allowConfirmed && row.trangThai === 'DaXacNhan');
    if (!ok)
      throw new AppException(409, PAYMENT_ERROR_CODES.NOT_AWAITING_PAYMENT, {
        chiTiet: { trangThai: row.trangThai },
      });
  }

  private insufficient(soDuKhaDung: string, soTienCan: string): AppException {
    return new AppException(409, WALLET_ERROR_CODES.INSUFFICIENT_BALANCE, {
      chiTiet: { soDuKhaDung, soTienCan },
    });
  }

  /** `GET …/payment-preview`: chỉ ĐỌC, số do máy chủ tính (kể cả khi ví có tiền đang giữ cho yêu cầu rút: dùng số KHẢ DỤNG; TLK-11). */
  async preview(
    accountId: string,
    maLichHen: string,
    now: Date = nowVN(),
  ): Promise<DepositPreview> {
    const row = await this.ownAppointment(accountId, maLichHen);
    this.assertPayable(row, false);
    const need = money(row.tienCoc);
    const available = (await this.balance.available(accountId)) ?? ZERO;
    const enough = compareMoney(available, need) >= 0;
    return {
      soTienCan: need,
      soDuKhaDung: available,
      soDuSauThanhToan: enough ? subtractMoney(available, need) : null,
      duSoDu: enough,
      hanThanhToan: row.hanThanhToan?.toISOString() ?? null,
      thoiGianMayChu: now.toISOString(),
    };
  }

  async pay(
    accountId: string,
    maLichHen: string,
  ): Promise<DepositPaymentResult> {
    const row = await this.ownAppointment(accountId, maLichHen);
    this.assertPayable(row, true);
    const need = money(row.tienCoc);
    // Chặn sớm ca phổ biến "thiếu tiền" CHỈ khi lịch còn chờ: lịch đã xác nhận (bấm đúp) phải ra `daXuLyTruocDo` dù số dư giờ đã thấp
    if (row.trangThai === 'ChoThanhToan') {
      const available = (await this.balance.available(accountId)) ?? ZERO;
      if (compareMoney(available, need) < 0)
        throw this.insufficient(available, need);
    }
    const outcome = await this.runPayment(accountId, row, need);
    switch (outcome.kind) {
      case 'Paid':
        return this.result(maLichHen, need, outcome.soDuKhaDung, false);
      case 'AlreadyPaid':
        return this.result(
          maLichHen,
          need,
          (await this.balance.available(accountId)) ?? ZERO,
          true,
        );
      case 'HoldExpired':
        throw new AppException(409, PAYMENT_ERROR_CODES.HOLD_EXPIRED);
      case 'InvalidState':
        throw new AppException(409, PAYMENT_ERROR_CODES.NOT_AWAITING_PAYMENT, {
          chiTiet: { trangThai: outcome.trangThai },
        });
      case 'InsufficientBalance':
        throw this.insufficient(outcome.soDuKhaDung, need);
    }
  }

  private result(
    maLichHen: string,
    soTien: string,
    soDuKhaDung: string,
    daXuLyTruocDo: boolean,
  ): DepositPaymentResult {
    return {
      maLichHen,
      trangThai: 'DaXacNhan',
      soTien,
      soDuKhaDung,
      daXuLyTruocDo,
    };
  }

  /** Phần GHI. Thân có thể bị CHẠY LẠI từ đầu (1213, 1205) nên không có tác dụng phụ ngoài DB; mọi giá trị tính lại trong thân. */
  private async runPayment(
    accountId: string,
    row: DepositAppointmentRow,
    need: string,
  ): Promise<PayOutcome> {
    try {
      return await withBookingTransaction<PayOutcome>(
        this.db,
        async (em) => {
          // Mốc của lượt, tính LẠI mỗi lần thử (thân chạy lại khi 1213, 1205): vừa là `thoi_diem_xac_nhan` của lịch (booking B19) vừa là mốc của giao dịch tiền và dòng sổ ví bên dưới
          const now = toSecond(nowVN());
          // (1) `confirmPaid` TRƯỚC mọi ghi bảng con và trước khoá ví: nó khoá khung giờ rồi `lich_hen` (tầng 5, 6)
          const confirm = await this.transitions.confirmPaid(em, {
            lichHenId: row.lichHenId,
            soTienDaThu: need,
            now,
          });
          if (confirm.kind === 'AlreadyConfirmed')
            return { kind: 'AlreadyPaid' };
          if (confirm.kind === 'HetHanGiuCho') return { kind: 'HoldExpired' };
          if (confirm.kind === 'InvalidState')
            return { kind: 'InvalidState', trangThai: confirm.trangThai };
          // (2) `Confirmed`: giao dịch tiền ghi vào LỊCH GỐC của chuỗi đổi lịch; ví khoá `FOR UPDATE` (hạng 7b) TRƯỚC mọi `INSERT` bảng con (H1)
          const rootId =
            (await this.chain.rootOf(em, row.lichHenId)) ?? row.lichHenId;
          const wallet = await this.ledger.lockWallet(em, accountId);
          // Bệnh nhân đã xác minh luôn có ví: thiếu là dữ liệu hỏng, ra 500 và hoàn tác cả `confirmPaid`
          if (wallet === null)
            throw new Error('Bệnh nhân không có hàng ví khi thanh toán cọc');
          const available = availableOf(wallet);
          // KIỂM LẠI dưới khoá: số dư có thể giảm sau bản đọc thường (rút tiền giữ, thanh toán lịch khác); thiếu ⇒ hoàn tác cả `confirmPaid` (TLK-03)
          if (compareMoney(available, need) < 0)
            throw new PaymentAbort<PayOutcome>({
              kind: 'InsufficientBalance',
              soDuKhaDung: available,
            });
          const paymentId = await this.repository.insertWalletPayment(em, {
            viNoiBoId: wallet.viNoiBoId,
            rootLichHenId: rootId,
            soTien: need,
            now,
          });
          const debited = await this.ledger.debit(em, wallet, {
            loai: 'ThanhToan',
            soTien: need,
            ref: { giaoDichThanhToanId: paymentId },
            now,
          });
          if (debited.kind !== 'Ok')
            throw new Error('Ví không đủ tiền dù đã kiểm dưới khoá');
          return { kind: 'Paid', soDuKhaDung: availableOf(debited.wallet) };
        },
        { label: 'pay-deposit' },
      );
    } catch (error) {
      if (error instanceof PaymentAbort) return error.outcome as PayOutcome;
      throw error;
    }
  }
}
