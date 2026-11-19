import type { DataSource } from 'typeorm';
import { AuditRepository } from '../../audit/audit.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { PaymentChain } from '../../payment/ports/payment-chain.js';
import { paymentWorld } from '../../payment/testing/payment-world.js';
import { WalletLedger } from '../ledger/wallet-ledger.js';
import { RefundNotifier } from '../refund/refund-notifier.js';
import { RefundRepository } from '../refund/refund.queries.js';
import { RefundService } from '../refund/refund.service.js';
import type { CreateSpecialRefundDto } from '../special-refund/special-refund.dto.js';
import { SpecialRefundRepository } from '../special-refund/special-refund.repository.js';
import { SpecialRefundService } from '../special-refund/special-refund.service.js';
import { WalletFixtures } from './wallet-fixtures.js';

// Hạ tầng test của hoàn tiền đặc biệt (payment B13): `SpecialRefundService` và `RefundService` (hoàn cọc B8, để đua) THẬT dựng bằng tay (không qua Nest), cùng thế giới có một khoản cọc 100.000đ
// trả bằng ví. `audit` truyền vào để ca "nhật ký lỗi" (HDB-09) thay bằng bản ném lỗi. Gom một chỗ cho int-spec và int-spec đồng thời (jscpd quét `*.int-spec.ts`).

export function specialRefundStack(
  db: DataSource,
  audit: Pick<AuditService, 'record'> = new AuditService(new AuditRepository()),
) {
  const refunds = new RefundRepository();
  const ledger = new WalletLedger();
  const chain = new PaymentChain();
  const service = new SpecialRefundService(
    db,
    new SpecialRefundRepository(),
    refunds,
    ledger,
    chain,
    audit as AuditService,
  );
  const autoRefund = new RefundService(
    db,
    refunds,
    ledger,
    chain,
    new RefundNotifier(),
  );
  return {
    service,
    autoRefund,
    /** Hoàn `soTien` đồng ("50000") của khoản `maGiaoDich` với lý do mặc định hợp lệ. */
    refund: (
      adminId: string,
      maGiaoDich: string,
      soTien: string,
      lyDo = 'Bệnh nhân khiếu nại hợp lệ',
    ) =>
      service.create(adminId, {
        maGiaoDich,
        soTien,
        lyDo,
      } as CreateSpecialRefundDto),
  };
}

/** Bệnh nhân kèm ví, MỘT lịch có khoản cọc `coc` trả bằng ví (ví đang 0đ sau khi trừ cọc, sổ cái nhất quán), và Quản trị viên toàn hệ thống. */
export async function specialRefundWorld(
  db: DataSource,
  input: { coc?: string; trangThai?: 'DaHuy' | 'DaXacNhan' } = {},
) {
  const w = await paymentWorld(db);
  const wallets = new WalletFixtures(db);
  const walletId = w.patient.wallet.viNoiBoId;
  await wallets.setWallet(walletId, '0.00');
  const coc = input.coc ?? '100000.00';
  const lich = await w.appointment(0, {
    trangThai: input.trangThai ?? 'DaHuy',
    coc,
  });
  const paymentId = await wallets.insertWalletDeposit({
    viNoiBoId: walletId,
    lichHenId: lich.lichHenId,
    soTien: coc,
  });
  return {
    w,
    wallets,
    walletId,
    lich,
    paymentId,
    adminId: w.systemAdmin.account.taiKhoanId,
  };
}
