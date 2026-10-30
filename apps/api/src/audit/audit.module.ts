import { Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository.js';
import { AuditService } from './audit.service.js';

// Không controller, không global manager; consumer import module và truyền manager transaction của mình.
@Module({ providers: [AuditRepository, AuditService], exports: [AuditService] })
export class AuditModule {}
