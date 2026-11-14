import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../../appointments/appointments.module.js';
import { AuditModule } from '../../audit/audit.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';

// Phần khám bệnh của module `doctor` (doctor-exam; PLAN 5.1): ghi hồ sơ khám, hoàn thành ca khám, xem hồ sơ, đánh giá bác sĩ, kiểm duyệt đánh giá. `DoctorModule` nhập module này.
// Task P3: CHỈ khung (imports); chưa controller, provider hay exports. Task sau thêm vào đây (không sửa doctor.module.ts):
//   B1 `ExamCompletionController` + `ExamCompletionService` (completion/: CHỖ DUY NHẤT của doctor/ được nhắc `AppointmentTransitionService`, PD-19) và `ExamNotifier`
//   B2 ghi/sửa hồ sơ (exam-record/)   B4, B5 xem hồ sơ của Bệnh nhân (patient-view/)   B6 đánh giá (rating/)   B7, B8 kiểm duyệt của Quản trị viên (moderation/)
// Cây phụ thuộc một chiều: examination → appointments, audit, rbac; KHÔNG import ngược doctor/ (chu trình bị examination.architecture.spec.ts bắt).
@Module({
  imports: [AppointmentsModule, AuditModule, RbacModule],
})
export class ExaminationModule {}
