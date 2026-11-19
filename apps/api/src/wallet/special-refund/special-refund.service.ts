import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { insertThongBao } from '../../appointments/notifications/thong-bao-insert.query.js';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { PaymentChain } from '../../payment/ports/payment-chain.js';
import { fromCents, toCents } from '../../pricing/money.js';
import { parsePublicId } from '../../search/common/id-param.js';
import { WalletLedger } from '../ledger/wallet-ledger.js';
import { RefundRepository } from '../refund/refund.queries.js';
import { nextAttemptNumber } from '../refund/refund.rules.js';
import {
  REFUND_NOTIFICATION_EVENTS,
  WALLET_ERROR_CODES,
  WALLET_ERROR_MESSAGES,
} from '../wallet.constants.js';
import type {
  CreateSpecialRefundDto,
  RefundablePayment,
  RefundablePaymentsQueryDto,
  SpecialRefundCreated,
} from './special-refund.dto.js';
import { SpecialRefundRepository } from './special-refund.repository.js';
import {
  buildSpecialRefundText,
  decideSpecialRefund,
  hasSpecialRefund,
  refundableOf,
} from './special-refund.rules.js';

type CreateOutcome =
  | { kind: 'Created'; result: SpecialRefundCreated }
  | { kind: 'NotFound' }
  | { kind: 'AlreadySpecial' }
  | { kind: 'Exceeds'; conCoTheHoan: string };

const notFound = () => new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);

/**
 * Quản trị viên `ToanHeThong` hoàn tiền đặc biệt về ví (payment B13; PLAN 5.6.2, 5.3 dòng "Hoàn tiền đặc biệt"; 2.4 HDB b5, A1, A2; HDB-01…HDB-12, DTT-12, BDT-08).
 *
 * `create` là MỘT giao dịch, khoá theo hạng 7a → 7b → 7c:
 *  1. khoá khoản thanh toán (7a, cùng hàng mà hoàn cọc tự động B8 khoá ⇒ hai việc trên cùng khoản xếp hàng, HDB-08). Không phải khoản qua ví hoàn được ⇒ 404 (HDB-11).
 *  2. đọc các dòng hoàn DƯỚI khoá: đã hoàn đặc biệt ⇒ 409 `DA_HOAN_DAC_BIET`; vượt số còn hoàn được ⇒ 409 `SO_TIEN_HOAN_VUOT_QUA_DA_THANH_TOAN` kèm `conCoTheHoan`.
 *  3. khoá ví (7b) → `INSERT lich_su_hoan_tien` `DacBiet` `ThanhCong` → `WalletLedger.credit('HoanTien')` → nhật ký `HoanTienDacBiet` (chi nhánh của lịch gốc; chỉ số tiền và lý do)
 *     → thông báo gắn lịch CUỐI của chuỗi (nếp B8; Trung chốt 19/11/2026).
 * Nhật ký hay thông báo lỗi ⇒ ném, hoàn tác trọn (HDB-09). Thân chạy lại được khi 1213/1205 (không tác dụng phụ ngoài DB).
 */
@Injectable()
export class SpecialRefundService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(SpecialRefundRepository)
    private readonly repository: SpecialRefundRepository,
    @Inject(RefundRepository) private readonly refunds: RefundRepository,
    @Inject(WalletLedger) private readonly ledger: WalletLedger,
    @Inject(PaymentChain) private readonly chain: PaymentChain,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Khoản qua ví còn hoàn được (HDB-01): bỏ khoản đã hoàn hết và khoản đã hoàn đặc biệt (Trung chốt 19/11/2026). Chỉ ĐỌC, không khoá. */
  async listRefundable(
    query: RefundablePaymentsQueryDto,
  ): Promise<RefundablePayment[]> {
    const byCode = query.maLichHen !== undefined;
    if (byCode === (query.benhNhanId !== undefined))
      throw new AppException(400, COMMON_ERROR_CODES.INVALID_DATA);
    const em = this.db.manager;
    let filter: { rootLichHenId: string } | { benhNhanId: string };
    if (query.maLichHen !== undefined) {
      const lichHenId = await this.repository.findAppointmentIdByCode(
        em,
        query.maLichHen,
      );
      if (lichHenId === null) return [];
      // Mã của bất kỳ lịch nào trong chuỗi đổi lịch ⇒ lịch gốc (khoản cọc gắn với lịch gốc)
      filter = {
        rootLichHenId: (await this.chain.rootOf(em, lichHenId)) ?? lichHenId,
      };
    } else filter = { benhNhanId: query.benhNhanId as string };

    const result: RefundablePayment[] = [];
    for (const payment of await this.repository.listWalletPayments(
      em,
      filter,
    )) {
      const rows = await this.refunds.listAttempts(
        em,
        payment.giaoDichThanhToanId,
      );
      if (hasSpecialRefund(rows)) continue;
      const { daHoan, conCoTheHoan } = refundableOf(payment.soTien, rows);
      if (conCoTheHoan === '0.00') continue;
      const leaf = await this.refunds.leafOf(em, payment.lichHenId);
      result.push({
        maGiaoDich: payment.giaoDichThanhToanId,
        maLichHen: (await this.repository.codeOf(em, leaf)) ?? '',
        soTien: payment.soTien,
        daHoan,
        conCoTheHoan,
        thoiDiem: payment.thoiDiem.toISOString(),
      });
    }
    return result;
  }

  async create(
    adminId: string,
    dto: CreateSpecialRefundDto,
  ): Promise<SpecialRefundCreated> {
    // Id sai dạng ⇒ 404 cùng thân với "không có" (QTT-13)
    const maGiaoDich = parsePublicId(dto.maGiaoDich);
    const soTien = fromCents(toCents(dto.soTien));

    const outcome = await withBookingTransaction<CreateOutcome>(
      this.db,
      async (em) => {
        const payment = await this.repository.lockWalletPayment(em, maGiaoDich);
        if (payment === null) return { kind: 'NotFound' };
        const rows = await this.refunds.listAttempts(em, maGiaoDich);
        const decision = decideSpecialRefund({
          rows,
          daThanhToan: payment.soTien,
          soTien,
        });
        if (decision.kind !== 'Credit') return decision;

        // (7b) ví X TRƯỚC mọi INSERT bảng con của ví (H1)
        const wallet = await this.ledger.lockWalletById(em, payment.viNoiBoId);
        if (wallet === null)
          throw new Error(
            'Khoản thanh toán không có hàng ví khi hoàn đặc biệt',
          );
        const now = toSecond(nowVN());
        const refundId = await this.refunds.insertAttempt(em, {
          giaoDichThanhToanId: maGiaoDich,
          viNoiBoId: payment.viNoiBoId,
          soTien,
          lyDo: dto.lyDo,
          trangThai: 'ThanhCong',
          soLanThu: nextAttemptNumber(rows),
          now,
          loai: 'DacBiet',
        });
        await this.ledger.credit(em, wallet, {
          loai: 'HoanTien',
          soTien,
          ref: { lichSuHoanTienId: refundId },
          now,
        });
        await this.audit.record(em, {
          actorId: adminId,
          branchId: await this.repository.branchOf(em, payment.lichHenId),
          action: 'HoanTienDacBiet',
          targetType: 'giao_dich_thanh_toan',
          targetId: maGiaoDich,
          result: 'ThanhCong',
          // Danh sách trắng: chỉ số tiền và lý do, không dữ liệu cá nhân (HDB-12)
          changes: { so_tien: soTien, ly_do: dto.lyDo },
        });
        const leaf = await this.refunds.leafOf(em, payment.lichHenId);
        const notice = await this.refunds.findAppointmentNotice(em, leaf);
        if (notice !== null)
          await insertThongBao(em, {
            taiKhoanId: notice.benhNhanId,
            noiDung: buildSpecialRefundText(notice.maLichHen, soTien),
            loaiSuKien: REFUND_NOTIFICATION_EVENTS.SPECIAL_REFUND,
            lichHenId: leaf,
            thoiDiemTao: now,
          });
        return { kind: 'Created', result: { maGiaoDich, soTien } };
      },
      { label: 'special-refund' },
    );

    switch (outcome.kind) {
      case 'Created':
        return outcome.result;
      case 'NotFound':
        throw notFound();
      case 'AlreadySpecial':
        throw new AppException(
          409,
          WALLET_ERROR_CODES.ALREADY_SPECIALLY_REFUNDED,
          { thongBao: WALLET_ERROR_MESSAGES.DA_HOAN_DAC_BIET },
        );
      case 'Exceeds':
        throw new AppException(409, WALLET_ERROR_CODES.REFUND_EXCEEDS_PAID, {
          thongBao: WALLET_ERROR_MESSAGES.SO_TIEN_HOAN_VUOT_QUA_DA_THANH_TOAN,
          chiTiet: { conCoTheHoan: outcome.conCoTheHoan },
        });
    }
  }
}
