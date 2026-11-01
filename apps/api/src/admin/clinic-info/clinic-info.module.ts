import { Module } from '@nestjs/common';
import { RbacModule } from '../../rbac/rbac.module.js';
import { ClinicInfoController } from './clinic-info.controller.js';
import { ClinicInfoRepository } from './clinic-info.repository.js';
import { ClinicInfoService } from './clinic-info.service.js';

@Module({
  imports: [RbacModule],
  controllers: [ClinicInfoController],
  providers: [ClinicInfoRepository, ClinicInfoService],
})
export class ClinicInfoModule {}
