import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { AdminScheduleController } from './schedule-view/admin-schedule.controller.js';
import { AdminScheduleRepository } from './schedule-view/admin-schedule.repository.js';
import { AdminScheduleService } from './schedule-view/admin-schedule.service.js';
import { DoctorScheduleController } from './schedule-view/doctor-schedule.controller.js';
import { ReceptionScheduleController } from './schedule-view/reception-schedule.controller.js';
import { ReceptionScheduleService } from './schedule-view/reception-schedule.service.js';
import { ScheduleGridService } from './schedule-view/schedule-grid.service.js';
import { ScheduleViewRepository } from './schedule-view/schedule-view.repository.js';
import { ScheduleViewService } from './schedule-view/schedule-view.service.js';
import { ShiftAssignmentController } from './shifts/shift-assignment.controller.js';
import { ShiftAssignmentRepository } from './shifts/shift-assignment.repository.js';
import { ShiftAssignmentService } from './shifts/shift-assignment.service.js';
import { ShiftRemovalRepository } from './shifts/shift-removal.repository.js';
import { ShiftRemovalService } from './shifts/shift-removal.service.js';

// Khung module `doctor`: phân công ca, xem lịch, xin nghỉ và duyệt nghỉ phép. Controller/service thêm dần ở B2…B17 (B2: xem trước phân công).
// Cây phụ thuộc một chiều (H20): doctor → scheduling; scheduling KHÔNG import appointments/ hay doctor/.
// KHÔNG gọi ScheduleModule.forRoot() ở đây: app.module.ts đã đăng ký một lần (sweeper B16 chỉ dùng @Cron).
@Module({
  imports: [SchedulingModule, RbacModule, AuditModule],
  controllers: [
    ShiftAssignmentController,
    DoctorScheduleController,
    AdminScheduleController,
    ReceptionScheduleController,
  ],
  providers: [
    ShiftAssignmentRepository,
    ShiftAssignmentService,
    ScheduleViewRepository,
    ScheduleViewService,
    AdminScheduleRepository,
    AdminScheduleService,
    ScheduleGridService,
    ReceptionScheduleService,
    ShiftRemovalRepository,
    ShiftRemovalService,
  ],
})
export class DoctorModule {}
