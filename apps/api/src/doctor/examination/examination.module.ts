import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../../appointments/appointments.module.js';
import { AuditModule } from '../../audit/audit.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { ExamCompletionController } from './completion/exam-completion.controller.js';
import { ExamCompletionService } from './completion/exam-completion.service.js';
import { ExamRecordController } from './exam-record/exam-record.controller.js';
import { ExamRecordService } from './exam-record/exam-record.service.js';
import { ExamNotifier } from './notifications/exam-notifier.js';
import { PatientExamRecordsController } from './patient-view/patient-exam-records.controller.js';
import { PatientExamRecordsRepository } from './patient-view/patient-exam-records.repository.js';
import { PatientExamRecordsService } from './patient-view/patient-exam-records.service.js';

// Phần khám bệnh của module `doctor` (doctor-exam; PLAN 5.1): ghi hồ sơ khám, hoàn thành ca khám, xem hồ sơ, đánh giá bác sĩ, kiểm duyệt đánh giá. `DoctorModule` nhập module này.
// P3 dựng khung (imports). B4 (đã làm) thêm `PatientExamRecordsController` + `PatientExamRecordsService` + `PatientExamRecordsRepository` (patient-view/: danh sách hồ sơ khám của Bệnh nhân, chỉ đọc). B2 (đã làm) thêm `ExamRecordController` + `ExamRecordService` (exam-record/: ghi và sửa hồ sơ khám; dùng `AuditService` của `AuditModule`). B1 (đã làm) thêm `ExamCompletionController` + `ExamCompletionService` (completion/: CHỖ DUY NHẤT của doctor/ được nhắc `AppointmentTransitionService`, PD-19) và `ExamNotifier`
// (notifications/; `thong_bao` `LichHenHoanThanh`). `DataSource` có sẵn toàn cục; `AppointmentsModule` xuất `AppointmentTransitionService`. Task sau thêm vào đây (không sửa doctor.module.ts):
//   B5 chi tiết hồ sơ của Bệnh nhân (patient-view/)   B6 đánh giá (rating/)   B7, B8 kiểm duyệt của Quản trị viên (moderation/)
// Cây phụ thuộc một chiều: examination → appointments, audit, rbac; KHÔNG import ngược doctor/ (chu trình bị examination.architecture.spec.ts bắt).
@Module({
  imports: [AppointmentsModule, AuditModule, RbacModule],
  controllers: [
    ExamCompletionController,
    ExamRecordController,
    PatientExamRecordsController,
  ],
  providers: [
    ExamCompletionService,
    ExamNotifier,
    ExamRecordService,
    PatientExamRecordsRepository,
    PatientExamRecordsService,
  ],
})
export class ExaminationModule {}
