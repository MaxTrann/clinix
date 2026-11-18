import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { AppException } from '../../common/errors/app.exception.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { compareMoney, fromCents, toCents } from '../../pricing/money.js';
import { availableOf, WalletLedger } from '../ledger/wallet-ledger.js';
import {
  WALLET_ERROR_CODES,
  WALLET_ERROR_MESSAGES,
  WITHDRAW_MIN,
} from '../wallet.constants.js';
import type {
  CreateWithdrawalDto,
  WithdrawalCreated,
} from './withdrawal.dto.js';
import { WithdrawalNotifier } from './withdrawal-notifier.js';
import { WithdrawalRepository } from './withdrawal.repository.js';

/** Kết quả CÓ KIỂU của phần ghi (trong giao dịch). Tình huống nghiệp vụ trả kết quả thay vì ném trong giao dịch (nếp B5, booking 5.3 quy tắc 4); service đổi sang `AppException` SAU giao dịch. */
type RequestOutcome =
  | { kind: 'Created'; result: WithdrawalCreated }
  | { kind: 'PendingExists' }
  | { kind: 'InsufficientBalance'; soDuKhaDung: string };

/**
 * Bệnh nhân gửi yêu cầu rút tiền (payment B11; PLAN 5.8; 2.4 RTV b1 đến b5, A1; RTV-01…RTV-06, DTT-04, DTT-10).
 *
 *  1. Ngoài giao dịch: số tiền ≥ tối thiểu Q20 (`WITHDRAW_MIN`), dưới ⇒ 400 `SO_TIEN_NGOAI_HAN_MUC`.
 *  2. MỘT giao dịch: khoá ví (7b) → đã có yêu cầu `ChoDuyet` ⇒ 409 `DA_CO_YEU_CAU_CHO_DUYET` → `WalletLedger.hold` (KIỂM DƯỚI KHOÁ số khả dụng = số dư − đang giữ; thiếu ⇒ 409
 *     `SO_DU_KHONG_DU`) → `INSERT yeu_cau_rut_tien` `ChoDuyet` → thông báo `RutTienDaGui`.
 *  3. KHÔNG ghi sổ cái `giao_dich_vi` lúc tạo: tiền chưa ra khỏi ví, chỉ bị GIỮ (`so_tien_dang_giu`); sổ cái ghi khi Quản trị viên duyệt (B12).
 * Đua thanh toán cọc hay nạp trên cùng ví: cùng khoá ví X, số khả dụng tính lại dưới khoá (H6, M7), nên `chk_vi_so_du` (3819) không bao giờ là con đường báo "không đủ" (RTV-06).
 * Mỗi lần gọi là một yêu cầu mới; bấm đúp thì lần hai gặp `DA_CO_YEU_CAU_CHO_DUYET` (không giữ tiền hai lần).
 */
@Injectable()
export class WithdrawalService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(WithdrawalRepository)
    private readonly repository: WithdrawalRepository,
    @Inject(WalletLedger) private readonly ledger: WalletLedger,
    @Inject(WithdrawalNotifier) private readonly notifier: WithdrawalNotifier,
  ) {}

  async request(
    accountId: string,
    dto: CreateWithdrawalDto,
  ): Promise<WithdrawalCreated> {
    const soTien = fromCents(toCents(dto.soTien));
    if (compareMoney(soTien, WITHDRAW_MIN) < 0)
      throw new AppException(400, WALLET_ERROR_CODES.AMOUNT_OUT_OF_RANGE, {
        thongBao: WALLET_ERROR_MESSAGES.SO_TIEN_NGOAI_HAN_MUC,
        chiTiet: { toiThieu: WITHDRAW_MIN },
      });

    const outcome = await withBookingTransaction<RequestOutcome>(
      this.db,
      async (em) => {
        const wallet = await this.ledger.lockWallet(em, accountId);
        // Bệnh nhân đã xác minh luôn có ví: thiếu là dữ liệu hỏng (500)
        if (wallet === null)
          throw new Error('Bệnh nhân không có hàng ví khi rút tiền');
        if (await this.repository.hasPending(em, wallet.viNoiBoId))
          return { kind: 'PendingExists' };
        const held = await this.ledger.hold(em, wallet, soTien);
        if (held.kind !== 'Ok')
          return { kind: 'InsufficientBalance', soDuKhaDung: held.soDuKhaDung };
        const now = toSecond(nowVN());
        const maYeuCau = await this.repository.insertRequest(em, {
          viNoiBoId: wallet.viNoiBoId,
          soTien,
          now,
        });
        await this.notifier.notifySubmitted(em, {
          benhNhanId: accountId,
          soTien,
          now,
        });
        return {
          kind: 'Created',
          result: {
            maYeuCau,
            soTien,
            soDuKhaDung: availableOf(held.wallet),
            soTienDangGiu: held.wallet.soTienDangGiu,
          },
        };
      },
      { label: 'request-withdrawal' },
    );

    switch (outcome.kind) {
      case 'Created':
        return outcome.result;
      case 'PendingExists':
        throw new AppException(
          409,
          WALLET_ERROR_CODES.PENDING_WITHDRAWAL_EXISTS,
          {
            thongBao: WALLET_ERROR_MESSAGES.DA_CO_YEU_CAU_CHO_DUYET,
          },
        );
      case 'InsufficientBalance':
        throw new AppException(409, WALLET_ERROR_CODES.INSUFFICIENT_BALANCE, {
          thongBao: WALLET_ERROR_MESSAGES.SO_DU_KHONG_DU,
          chiTiet: { soDuKhaDung: outcome.soDuKhaDung, soTienCan: soTien },
        });
    }
  }
}
