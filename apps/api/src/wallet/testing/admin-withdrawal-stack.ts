import type { DataSource } from 'typeorm';
import { AuditRepository } from '../../audit/audit.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { WalletLedger } from '../ledger/wallet-ledger.js';
import { AdminWithdrawalRepository } from '../withdrawal/admin-withdrawal.repository.js';
import { AdminWithdrawalService } from '../withdrawal/admin-withdrawal.service.js';
import { WithdrawalNotifier } from '../withdrawal/withdrawal-notifier.js';

// Hạ tầng test của Quản trị viên duyệt rút tiền (payment B12): `AdminWithdrawalService` THẬT dựng bằng tay (không qua Nest). `audit` truyền vào để ca "nhật ký lỗi" (XRT-07, TDT-08) thay bằng bản ném lỗi.
export function adminWithdrawalStack(
  db: DataSource,
  audit: Pick<AuditService, 'record'> = new AuditService(new AuditRepository()),
) {
  return new AdminWithdrawalService(
    db,
    new AdminWithdrawalRepository(),
    new WalletLedger(),
    new WithdrawalNotifier(),
    audit as AuditService,
  );
}
