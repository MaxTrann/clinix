import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module.js';
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
import { DoctorLeaveController } from './leave-requests/doctor-leave.controller.js';
import { AdminLeaveApproveService } from './leave-approval/admin-leave-approve.service.js';
import { AdminLeaveController } from './leave-approval/admin-leave.controller.js';
import { APPOINTMENT_CANCELLATION_PORT } from './leave-approval/appointment-cancellation.port.js';
import { BookingCancellationAdapter } from './leave-approval/booking-cancellation.adapter.js';
import { LeaveCancellationRunner } from './leave-approval/leave-cancellation.runner.js';
import { AdminLeaveRejectService } from './leave-approval/admin-leave-reject.service.js';
import { AdminLeaveRepository } from './leave-approval/admin-leave.repository.js';
import { AdminLeaveService } from './leave-approval/admin-leave.service.js';
import { DoctorLeaveHistoryRepository } from './leave-requests/doctor-leave-history.repository.js';
import { DoctorLeaveHistoryService } from './leave-requests/doctor-leave-history.service.js';
import { DoctorLeaveRepository } from './leave-requests/doctor-leave.repository.js';
import { DoctorLeaveService } from './leave-requests/doctor-leave.service.js';
import { LeaveNotifier } from './notifications/leave-notifier.js';
import { ShiftAssignmentController } from './shifts/shift-assignment.controller.js';
import { ShiftAssignmentRepository } from './shifts/shift-assignment.repository.js';
import { ShiftAssignmentService } from './shifts/shift-assignment.service.js';
import { ShiftRemovalRepository } from './shifts/shift-removal.repository.js';
import { ShiftRemovalService } from './shifts/shift-removal.service.js';

// Khung module `doctor`: phân công ca, xem lịch, xin nghỉ và duyệt nghỉ phép. Controller/service thêm dần ở B2…B17 (B2: xem trước phân công).
// Cây phụ thuộc một chiều (H20): doctor → scheduling; scheduling KHÔNG import appointments/ hay doctor/.
// KHÔNG gọi ScheduleModule.forRoot() ở đây: app.module.ts đã đăng ký một lần (sweeper B16 chỉ dùng @Cron).
@Module({
  // AppointmentsModule (booking B10, B11): `cancel` và `findAffectedByLeave` cho Duyệt (B15). Chiều phụ thuộc chỉ doctor → appointments (H20).
  imports: [SchedulingModule, RbacModule, AuditModule, AppointmentsModule],
  controllers: [
    ShiftAssignmentController,
    DoctorScheduleController,
    AdminScheduleController,
    ReceptionScheduleController,
    DoctorLeaveController,
    AdminLeaveController,
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
    LeaveNotifier,
    DoctorLeaveRepository,
    DoctorLeaveService,
    DoctorLeaveHistoryRepository,
    DoctorLeaveHistoryService,
    AdminLeaveRepository,
    AdminLeaveService,
    AdminLeaveRejectService,
    AdminLeaveApproveService,
    LeaveCancellationRunner,
    BookingCancellationAdapter,
    // Chỉ một bản thật, không Noop (Q26); test thay token này bằng bản giả.
    {
      provide: APPOINTMENT_CANCELLATION_PORT,
      useExisting: BookingCancellationAdapter,
    },
  ],
})
export class DoctorModule {}
