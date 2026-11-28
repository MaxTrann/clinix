import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module.js';
import { AdminDashboardController } from './admin/admin-dashboard.controller.js';
import { AdminDashboardService } from './admin/admin-dashboard.service.js';

// Scope dashboard (PLAN dashboard 1.2, T1, T4): CHỈ ĐỌC, tự viết câu SQL của mình, không import service của module khác.
// Chỉ nhập `RbacModule` để có `AdminScopeGuard` (đọc phạm vi Quản trị viên từ DB mỗi request). B3 thêm route của Lễ tân vào đây.
@Module({
  imports: [RbacModule],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class DashboardModule {}
