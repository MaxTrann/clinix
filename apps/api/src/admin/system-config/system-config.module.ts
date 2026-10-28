import { Module } from '@nestjs/common';
import { SystemConfigRepository } from './system-config.repository.js';
import { SystemConfigService } from './system-config.service.js';

@Module({
  providers: [SystemConfigRepository, SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
