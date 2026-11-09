import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';

// Khung module `doctor`: phân công ca, xem lịch, xin nghỉ và duyệt nghỉ phép. Controller/service thêm ở B2…B17.
// Cây phụ thuộc một chiều (H20): doctor → scheduling; scheduling KHÔNG import appointments/ hay doctor/.
// KHÔNG gọi ScheduleModule.forRoot() ở đây: app.module.ts đã đăng ký một lần (sweeper B16 chỉ dùng @Cron).
@Module({
  imports: [SchedulingModule, RbacModule, AuditModule],
})
export class DoctorModule {}
