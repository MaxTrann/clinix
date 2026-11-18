import type { DataSource } from 'typeorm';
import { WalletLedger } from '../ledger/wallet-ledger.js';
import { WithdrawalNotifier } from '../withdrawal/withdrawal-notifier.js';
import type { CreateWithdrawalDto } from '../withdrawal/withdrawal.dto.js';
import { WithdrawalRepository } from '../withdrawal/withdrawal.repository.js';
import { WithdrawalService } from '../withdrawal/withdrawal.service.js';

// Hạ tầng test của rút tiền phía Bệnh nhân (payment B11): `WithdrawalService` THẬT dựng bằng tay (không qua Nest). Gom một chỗ vì int-spec, int-spec đồng thời của B11 và DTT-04 của B5
// cùng cần (jscpd quét `*.int-spec.ts`).

export function withdrawalStack(db: DataSource) {
  const service = new WithdrawalService(
    db,
    new WithdrawalRepository(),
    new WalletLedger(),
    new WithdrawalNotifier(),
  );
  return {
    service,
    /** Gửi yêu cầu rút `soTien` đồng ("100000") cho Bệnh nhân `accountId`. */
    request: (accountId: string, soTien: string) =>
      service.request(accountId, { soTien } as CreateWithdrawalDto),
  };
}
