import { Module } from '@nestjs/common';
import { RbacModule } from '../../rbac/rbac.module.js';
import { ServiceGroupController } from './service-group.controller.js';
import { ServiceGroupRepository } from './service-group.repository.js';
import { ServiceGroupService } from './service-group.service.js';

@Module({
  imports: [RbacModule],
  controllers: [ServiceGroupController],
  providers: [ServiceGroupRepository, ServiceGroupService],
})
export class ServiceGroupModule {}
