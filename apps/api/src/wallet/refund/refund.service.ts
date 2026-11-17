import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import type {
  RefundPort,
  RefundResult,
  RefundView,
} from '../../appointments/ports/wallet.port.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { compareMoney } from '../../pricing/money.js';
import { PaymentChain } from '../../payment/ports/payment-chain.js';
import { WalletLedger } from '../ledger/wallet-ledger.js';
import { REFUND_MAX_ATTEMPTS } from '../wallet.constants.js';
import { RefundNotifier } from './refund-notifier.js';
import {
  RefundRepository,
  type RefundPayment,
  type RetryCandidate,
} from './refund.queries.js';
import { decideRefund, failedAutoAttempts } from './refund.rules.js';

/** Tên lớp lỗi để ghi log: KHÔNG bao giờ ghi `error.message` (có thể chứa SQL, id ví, số tiền). */
const errorNameOf = (error: unknown): string =>
  error instanceof Error ? error.name : typeof error;

interface AttemptInput {
  giaoDichThanhToanId: string;
  /** Lịch bị huỷ để gắn thông báo; `null` ⇒ suy ra từ lịch gốc của khoản (đường thử lại của job, không có `lichHenId` trong tay) */
  noticeLichHenId: string | null;
  soTien: string;
  lyDo: string | null;
}

/**
 * Hoàn cọc tự động về ví (payment B8; PLAN 5.6.1, E4; HCC-01…HCC-14, DTT-13, DTT-16, HDT-05, TDT-04). Bản thật của `RefundPort` (booking B9 của Đại nối bằng `useExisting`; task này chỉ XUẤT lớp).
 *
 * `refund` chạy SAU commit huỷ của booking, đúng một lần, và KHÔNG ném cho lỗi hoàn: kết quả `Failed` (lỗi hoàn không hoàn tác việc huỷ, HLH A3). Luồng:
 *  1. NGOÀI giao dịch: lịch gốc (`PaymentChain`), khoản thanh toán qua ví của lịch gốc. Không có ⇒ `NotNeeded` (cọc 0đ, chỉ tiền mặt), không ghi gì.
 *  2. `withBookingTransaction`: khoá khoản thanh toán X (7a) → đọc các dòng hoàn → `decideRefund` (đã hoàn ⇒ `Refunded` không ghi; đủ lần ⇒ `Failed`; hết chỗ ⇒ `NotNeeded`) → khoá ví X (7b) →
 *     `INSERT lich_su_hoan_tien` `ThanhCong` → `WalletLedger.credit` (UPDATE ví, INSERT `giao_dich_vi` `HoanTien`) → `thong_bao` gắn lịch → commit.
 *  3. Lỗi ở bước 2 ⇒ hoàn tác trọn; rồi MỘT giao dịch riêng ghi dòng `ThatBai` mang `so_tien` và `ly_do` (lần thử sau không tính lại số hoàn). Sau lần thất bại thứ `REFUND_MAX_ATTEMPTS` thì báo các
 *     Quản trị viên `ToanHeThong` (`HoanCocCanXuLy`) trong CÙNG giao dịch ghi dòng đó.
 *  4. `RefundRetryJob` gọi `retry` cho ứng viên; cùng thuật toán, cùng số và lý do đã ghi.
 * Thân giao dịch có thể bị CHẠY LẠI từ đầu (1213, 1205): không tác dụng phụ ngoài DB, mọi giá trị tính lại trong thân. Log CHỈ có tên lớp lỗi và id khoản: không số tiền, không `error.message`.
 * KHÔNG `UPDATE lich_hen`/`khung_gio` (QTT-08): payment và wallet không đổi trạng thái lịch.
 */
@Injectable()
export class RefundService implements RefundPort {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(RefundRepository) private readonly repository: RefundRepository,
    @Inject(WalletLedger) private readonly ledger: WalletLedger,
    @Inject(PaymentChain) private readonly chain: PaymentChain,
    @Inject(RefundNotifier) private readonly notifier: RefundNotifier,
  ) {}

  async refund(input: {
    lichHenId: string;
    soTien: string;
    lyDo: string;
  }): Promise<RefundResult> {
    // Booking chỉ gọi khi số tiền > 0; số không dương là gọi sai ⇒ "không cần" thay vì ghi dòng 0đ
    if (compareMoney(input.soTien, '0.00') <= 0) return { kind: 'NotNeeded' };
    const rootId =
      (await this.chain.rootOf(this.db.manager, input.lichHenId)) ??
      input.lichHenId;
    const payment = await this.repository.findWalletPaymentOfRoot(
      this.db.manager,
      rootId,
    );
    if (payment === null) return { kind: 'NotNeeded' };
    return this.attempt({
      giaoDichThanhToanId: payment.giaoDichThanhToanId,
      noticeLichHenId: input.lichHenId,
      soTien: input.soTien,
      lyDo: input.lyDo,
    });
  }

  /** Thử lại MỘT ứng viên của job: đúng số và lý do ĐÃ GHI ở dòng `ThatBai` (không tính lại). */
  retry(candidate: RetryCandidate): Promise<RefundResult> {
    return this.attempt({
      giaoDichThanhToanId: candidate.giaoDichThanhToanId,
      noticeLichHenId: null,
      soTien: candidate.soTien,
      lyDo: candidate.lyDo,
    });
  }

  /** Dòng hoàn MỚI NHẤT của khoản thanh toán của lịch (qua lịch gốc), chỉ ĐỌC trên `em` của người gọi; `null` khi chưa hoàn lần nào (HDT-05). Không lộ số lần thử hay ví. */
  async findRefund(
    em: EntityManager,
    lichHenId: string,
  ): Promise<RefundView | null> {
    const rootId = (await this.chain.rootOf(em, lichHenId)) ?? lichHenId;
    const payment = await this.repository.findWalletPaymentOfRoot(em, rootId);
    if (payment === null) return null;
    const latest = await this.repository.latestAttempt(
      em,
      payment.giaoDichThanhToanId,
    );
    if (latest === null) return null;
    return {
      soTien: latest.soTien,
      trangThai: latest.trangThai,
      thoiDiem: latest.thoiDiem.toISOString(),
    };
  }

  private async attempt(input: AttemptInput): Promise<RefundResult> {
    try {
      return await this.runCredit(input);
    } catch (error) {
      this.logger.error(
        `Hoàn cọc của khoản ${input.giaoDichThanhToanId} thất bại: ${errorNameOf(error)}`,
      );
      await this.recordFailure(input);
      return { kind: 'Failed' };
    }
  }

  /** Phần GHI chính, trong một giao dịch. Ném khi lỗi (giao dịch tự hoàn tác); kết quả có kiểu cho các ca nghiệp vụ. */
  private runCredit(input: AttemptInput): Promise<RefundResult> {
    return withBookingTransaction<RefundResult>(
      this.db,
      async (em) => {
        // (7a) khoá khoản thanh toán TRƯỚC mọi đọc dòng hoàn: tuần tự hoá hai lần thử và hoàn đặc biệt trên cùng khoản
        const payment = await this.repository.lockPayment(
          em,
          input.giaoDichThanhToanId,
        );
        if (payment === null) return { kind: 'NotNeeded' };
        const rows = await this.repository.listAttempts(
          em,
          payment.giaoDichThanhToanId,
        );
        const decision = decideRefund({
          rows,
          daThanhToan: payment.soTien,
          soTien: input.soTien,
        });
        if (decision.kind === 'AlreadyRefunded') return { kind: 'Refunded' };
        if (decision.kind === 'AttemptsExhausted') return { kind: 'Failed' };
        if (decision.kind === 'NothingLeft') return { kind: 'NotNeeded' };

        // (7b) ví X TRƯỚC mọi INSERT bảng con của ví (H1)
        const wallet = await this.ledger.lockWalletById(em, payment.viNoiBoId);
        if (wallet === null)
          throw new Error('Khoản thanh toán không có hàng ví khi hoàn cọc');
        const now = toSecond(nowVN());
        const refundId = await this.repository.insertAttempt(em, {
          giaoDichThanhToanId: payment.giaoDichThanhToanId,
          viNoiBoId: payment.viNoiBoId,
          soTien: decision.soTien,
          lyDo: input.lyDo,
          trangThai: 'ThanhCong',
          soLanThu: decision.soLanThu,
          now,
        });
        await this.ledger.credit(em, wallet, {
          loai: 'HoanTien',
          soTien: decision.soTien,
          ref: { lichSuHoanTienId: refundId },
          now,
        });
        await this.notifyRefunded(em, payment, input, decision.soTien, now);
        return { kind: 'Refunded' };
      },
      { label: 'refund-deposit' },
    );
  }

  private async notifyRefunded(
    em: EntityManager,
    payment: RefundPayment,
    input: AttemptInput,
    soTien: string,
    now: Date,
  ): Promise<void> {
    const lichHenId =
      input.noticeLichHenId ??
      (await this.repository.leafOf(em, payment.lichHenId));
    const notice = await this.repository.findAppointmentNotice(em, lichHenId);
    if (notice === null) return;
    await this.notifier.notifyRefunded(em, {
      lichHenId,
      taiKhoanId: notice.benhNhanId,
      maLichHen: notice.maLichHen,
      soTien,
      now,
    });
  }

  /**
   * Giao dịch RIÊNG ghi dòng `ThatBai` (sau khi giao dịch chính đã hoàn tác), mang `so_tien` và `ly_do`. Khoá 7a rồi KIỂM LẠI: đã có ai hoàn xong, hay đã đủ lần ⇒ không ghi thêm. Ghi dòng thứ
   * `REFUND_MAX_ATTEMPTS` thì báo Quản trị viên trong cùng giao dịch. Chính bước này lỗi ⇒ chỉ log: tiến trình chết hay DB sập đúng lúc này không để lại dấu vết (HCC-14, Q16 phương án (d), TECH_DEBT 163).
   */
  private async recordFailure(input: AttemptInput): Promise<void> {
    try {
      await withBookingTransaction(
        this.db,
        async (em) => {
          const payment = await this.repository.lockPayment(
            em,
            input.giaoDichThanhToanId,
          );
          if (payment === null) return;
          const rows = await this.repository.listAttempts(
            em,
            payment.giaoDichThanhToanId,
          );
          if (
            rows.some(
              (row) => row.loai === 'TuDong' && row.trangThai === 'ThanhCong',
            ) ||
            failedAutoAttempts(rows) >= REFUND_MAX_ATTEMPTS
          )
            return;
          const now = toSecond(nowVN());
          await this.repository.insertAttempt(em, {
            giaoDichThanhToanId: payment.giaoDichThanhToanId,
            viNoiBoId: payment.viNoiBoId,
            soTien: input.soTien,
            lyDo: input.lyDo,
            trangThai: 'ThatBai',
            soLanThu: rows.reduce((max, r) => Math.max(max, r.soLanThu), 0) + 1,
            now,
          });
          if (failedAutoAttempts(rows) + 1 >= REFUND_MAX_ATTEMPTS)
            await this.notifyNeedsAttention(em, payment, input, now);
        },
        { label: 'refund-record-failure' },
      );
    } catch (error) {
      this.logger.error(
        `Không ghi được dòng ThatBai của khoản ${input.giaoDichThanhToanId}: ${errorNameOf(error)}`,
      );
    }
  }

  private async notifyNeedsAttention(
    em: EntityManager,
    payment: RefundPayment,
    input: AttemptInput,
    now: Date,
  ): Promise<void> {
    const lichHenId =
      input.noticeLichHenId ??
      (await this.repository.leafOf(em, payment.lichHenId));
    const notice = await this.repository.findAppointmentNotice(em, lichHenId);
    if (notice === null) return;
    await this.notifier.notifyNeedsAttention(em, {
      lichHenId,
      maLichHen: notice.maLichHen,
      adminIds: await this.repository.findSystemAdmins(em),
      now,
    });
  }
}
