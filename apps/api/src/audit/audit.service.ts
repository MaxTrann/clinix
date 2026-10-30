import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { nowVN, toSecond } from '../common/time/time.js';
import type { AuditEntry } from './audit-entry.js';
import { AuditError } from './audit-error.js';
import { AuditRepository } from './audit.repository.js';
import { validateAuditEntry } from './audit-validation.js';

@Injectable()
export class AuditService {
  constructor(
    @Inject(AuditRepository) private readonly repository: AuditRepository,
  ) {}

  async record(manager: EntityManager, input: AuditEntry): Promise<void> {
    const runner = manager?.queryRunner;
    if (
      !runner ||
      runner.isReleased ||
      !runner.isTransactionActive ||
      runner.manager !== manager
    )
      throw new AuditError('AUDIT_TRANSACTION_REQUIRED');
    const entry = validateAuditEntry(input);
    const at = toSecond(nowVN());
    try {
      await this.repository.insert(manager, entry, at);
    } catch {
      // Không giữ cause/query/parameters của driver: có thể chứa nguyên payload hoặc dữ liệu nhạy cảm.
      throw new AuditError('AUDIT_WRITE_FAILED');
    }
  }
}
