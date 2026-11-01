import { Module } from '@nestjs/common';
import { RbacModule } from '../../rbac/rbac.module.js';
import { ServiceController } from './service.controller.js';
import { ServiceRepository } from './service.repository.js';
import { ServiceService } from './service.service.js';

@Module({
  imports: [RbacModule],
  controllers: [ServiceController],
  providers: [ServiceRepository, ServiceService],
})
export class ServiceModule {}
