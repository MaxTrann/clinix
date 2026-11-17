import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../../appointments/appointments.module.js';
import { AuditModule } from '../../audit/audit.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { ExamCompletionController } from './completion/exam-completion.controller.js';
import { ExamCompletionService } from './completion/exam-completion.service.js';
import { ExamRecordController } from './exam-record/exam-record.controller.js';
import { ExamRecordService } from './exam-record/exam-record.service.js';
import { AdminRatingsController } from './moderation/admin-ratings.controller.js';
import { AdminRatingsRepository } from './moderation/admin-ratings.repository.js';
import { AdminRatingsService } from './moderation/admin-ratings.service.js';
import { RatingHideRepository } from './moderation/rating-hide.repository.js';
import { RatingHideService } from './moderation/rating-hide.service.js';
import { ExamNotifier } from './notifications/exam-notifier.js';
import { PatientExamDetailRepository } from './patient-view/patient-exam-detail.repository.js';
import { PatientExamDetailService } from './patient-view/patient-exam-detail.service.js';
import { PatientExamRecordsController } from './patient-view/patient-exam-records.controller.js';
import { PatientExamRecordsRepository } from './patient-view/patient-exam-records.repository.js';
import { PatientExamRecordsService } from './patient-view/patient-exam-records.service.js';
import { RatingController } from './rating/rating.controller.js';
import { RatingService } from './rating/rating.service.js';

// Phần khám bệnh của module `doctor` (doctor-exam; PLAN 5.1): ghi hồ sơ khám, hoàn thành ca khám, xem hồ sơ, đánh giá bác sĩ, kiểm duyệt đánh giá. `DoctorModule` nhập module này.
// P3 dựng khung (imports). B8 (đã làm) thêm `RatingHideService` + `RatingHideRepository` (moderation/: Quản trị viên ẨN một đánh giá, MỘT chiều, kèm nhật ký `AnDanhGia` của `AuditService`; route `POST :id/hide` nằm trong `AdminRatingsController`, nên `controllers` KHÔNG đổi). B7 (đã làm) thêm `AdminRatingsController` + `AdminRatingsService` + `AdminRatingsRepository` (moderation/: Quản trị viên xem danh sách và chi tiết đánh giá, chỉ đọc; `RbacModule` đã import cho `AdminScopeGuard` và `BranchAccessPolicy`). B6 (đã làm) thêm `RatingController` + `RatingService` (rating/: Bệnh nhân gửi đánh giá bác sĩ, `POST /patient/exam-records/:maLichHen/rating`; repository là hàm, không provider; không dùng `AuditService`). B5 (đã làm) thêm `PatientExamDetailService` + `PatientExamDetailRepository` (patient-view/: chi tiết một lịch, chỉ đọc; route `GET :maLichHen` nằm trong `PatientExamRecordsController`, nên `controllers` KHÔNG đổi). B4 (đã làm) thêm `PatientExamRecordsController` + `PatientExamRecordsService` + `PatientExamRecordsRepository` (patient-view/: danh sách hồ sơ khám của Bệnh nhân, chỉ đọc). B2 (đã làm) thêm `ExamRecordController` + `ExamRecordService` (exam-record/: ghi và sửa hồ sơ khám; dùng `AuditService` của `AuditModule`). B1 (đã làm) thêm `ExamCompletionController` + `ExamCompletionService` (completion/: CHỖ DUY NHẤT của doctor/ được nhắc `AppointmentTransitionService`, PD-19) và `ExamNotifier`
// (notifications/; `thong_bao` `LichHenHoanThanh`). `DataSource` có sẵn toàn cục; `AppointmentsModule` xuất `AppointmentTransitionService`. Task sau thêm vào đây (không sửa doctor.module.ts):
//   (không còn task backend nào của scope này chờ ở đây: B9 sửa `search/`, B10 thêm seed ở `database/seeds/`)
// Cây phụ thuộc một chiều: examination → appointments, audit, rbac; KHÔNG import ngược doctor/ (chu trình bị examination.architecture.spec.ts bắt).
@Module({
  imports: [AppointmentsModule, AuditModule, RbacModule],
  controllers: [
    AdminRatingsController,
    ExamCompletionController,
    ExamRecordController,
    PatientExamRecordsController,
    RatingController,
  ],
  providers: [
    AdminRatingsRepository,
    AdminRatingsService,
    ExamCompletionService,
    ExamNotifier,
    ExamRecordService,
    PatientExamDetailRepository,
    PatientExamDetailService,
    PatientExamRecordsRepository,
    PatientExamRecordsService,
    RatingHideRepository,
    RatingHideService,
    RatingService,
  ],
})
export class ExaminationModule {}
