import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { SystemConfigAdminRepository } from './system-config-admin.repository.js';
import { SystemConfigAdminService } from './system-config-admin.service.js';
import { SystemConfigController } from './system-config.controller.js';
import { SystemConfigModule } from './system-config.module.js';

// Phần quản trị (GET/PUT) của cấu hình hệ thống (admin B5). Tách khỏi `SystemConfigModule` của C3 để module đọc, vốn được appointments và payment import,
// không phải kéo thêm RbacModule, AuditModule và controller; `SystemConfigService` vẫn là cổng ĐỌC duy nhất (không đổi chữ ký).
@Module({
  imports: [SystemConfigModule, RbacModule, AuditModule],
  controllers: [SystemConfigController],
  providers: [SystemConfigAdminRepository, SystemConfigAdminService],
})
export class SystemConfigAdminModule {}
