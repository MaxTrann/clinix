import { Module } from '@nestjs/common';
import { SystemConfigModule } from '../admin/system-config/system-config.module.js';
import { ExamPriceReader } from '../pricing/exam-price.reader.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import {
  APPOINTMENT_CODE_RANDOM,
  randomCodeSuffix,
} from './appointment-code.js';
import { AppointmentCancellationService } from './cancel/appointment-cancellation.service.js';
import { CancelPreviewService } from './cancel/cancel-preview.service.js';
import { PatientCancelController } from './cancel/patient-cancel.controller.js';
import { BookingChecksController } from './create/booking-checks.controller.js';
import { BookingChecksService } from './create/booking-checks.service.js';
import { BookingEligibilityService } from './create/booking-eligibility.service.js';
import { BookingSummaryReader } from './create/booking-summary.reader.js';
import { CreateAppointmentController } from './create/create-appointment.controller.js';
import { CreateAppointmentService } from './create/create-appointment.service.js';
import { RefundPolicyReader } from './create/refund-policy.js';
import { HoldExpiryJob } from './expiry/hold-expiry.job.js';
import { DoctorAppointmentsController } from './lists/doctor-appointments.controller.js';
import { DoctorAppointmentsRepository } from './lists/doctor-appointments.repository.js';
import { DoctorAppointmentsService } from './lists/doctor-appointments.service.js';
import { OperationsAppointmentsRepository } from './lists/operations-appointments.repository.js';
import { OperationsAppointmentsService } from './lists/operations-appointments.service.js';
import { PatientAppointmentDetailService } from './lists/patient-appointment-detail.service.js';
import { PatientAppointmentsController } from './lists/patient-appointments.controller.js';
import { PatientAppointmentsRepository } from './lists/patient-appointments.repository.js';
import { PatientAppointmentsService } from './lists/patient-appointments.service.js';
import { ReceptionAppointmentsController } from './lists/reception-appointments.controller.js';
import { ReceptionAppointmentsService } from './lists/reception-appointments.service.js';
import { BOOKING_PORT_PROVIDERS } from './ports/ports.providers.js';
import { AppointmentQueries } from './queries/appointment-queries.js';
import { BookabilityReader } from './slots/bookability.reader.js';
import { SlotHoldService } from './slots/slot-hold.service.js';
import { AppointmentTransitionService } from './state/appointment-transition.service.js';

// Module `booking` (PLAN booking 5.1, 5.10; TRACKING 3.3 P1-B, 3.6 P2-B, P2-D). P1 dựng vỏ; P2 thêm TÁM cổng sang module khác, mỗi cổng gắn bản `Noop` mặc định
// (`ports/ports.providers.ts`). Mọi thứ khác P1 làm ra (ma trận trạng thái, hằng và mã lỗi, `withBookingTransaction`, `lock-order`) là hàm hoặc hằng thuần mà nơi
// khác dùng bằng `import`; ba file của patient B5 cũng là hàm thuần nhận `EntityManager`. Đăng ký vào `AppModule` MỘT lần ở P1 để các task sau chỉ thêm provider
// trong `appointments/`, không đụng lại `app.module.ts` (file dùng chung), và để test kiến trúc AR-03 kiểm được chiều phụ thuộc.
//
// Task nào thêm gì (providers; exports là các dịch vụ DÙNG CHUNG cho doctor, payment, wallet, waitlist):
//   B6  `SlotHoldService` (imports: SchedulingModule)          B9 (đã làm) `AppointmentTransitionService` (nơi DUY NHẤT ghi `lich_hen.trang_thai`, H7; `expire`), `HoldExpiryJob`
//   B10 (đã làm) `AppointmentCancellationService` (`cancel/`; MỘT nơi huỷ cho Bệnh nhân, Lễ tân, Quản trị viên và `doctor`; EXPORT cho `doctor`, hướng `doctor → appointments` đúng H20), `CancelPreviewService`,
//       `PatientCancelController` (`GET …/cancel-preview`, `POST …/cancel`); tiêm `BranchAccessPolicy` của `RbacModule` đã nhập.
//   B11 (đã làm) `AppointmentQueries` (`queries/`; D5, D13, D14) và `confirmPaid`, `complete` của `AppointmentTransitionService`
//   B14 thêm AuditModule; controller và service của B1 đến B14 (B3 đã thêm RbacModule và SystemConfigModule)
//   B1 (đã làm) `PatientAppointmentsController`, `PatientAppointmentsService`, `PatientAppointmentsRepository` (`lists/`; `GET /patient/appointments`, chỉ đọc)
//   B2 (đã làm) `PatientAppointmentDetailService` (`lists/`; `GET /patient/appointments/:maLichHen`, chỉ đọc; cùng controller và repository của B1)
//   B3 (đã làm) `ReceptionAppointmentsController` + `ReceptionAppointmentsService` (`GET /reception/appointments` và `/:maLichHen`, chỉ đọc, phạm vi chi nhánh của Lễ tân) trên lớp dùng chung
//       `OperationsAppointmentsService` + `OperationsAppointmentsRepository` (cũng là nền của B4 Quản trị viên). `imports: [RbacModule` (phạm vi `ReceptionScopeService`, `BranchAccessPolicy`),
//       `SystemConfigModule` (khung giờ check-in cho `chuyenDuoc` của chi tiết)`]`: cả hai là module lá, không import ngược `AppointmentsModule` nên không tạo vòng.
//   B5 (đã làm) `DoctorAppointmentsController` + `DoctorAppointmentsService` + `DoctorAppointmentsRepository` (`GET /doctor/appointments` và `/:maLichHen`, chỉ đọc, chỉ lịch của chính bác sĩ; dùng nền
//       `list-query.*` của B1, B3, KHÔNG dùng `OperationsAppointmentsService`: không có JOIN hay cột giá, phạm vi là `bac_si_id` thay vì chi nhánh). Không thêm `imports`.
//   B6a (đã làm) `BookabilityReader` (`slots/`; đọc dữ kiện cho `evaluateBookability`, chỉ đọc; cần `BranchHoursReader` của SchedulingModule và hai cổng bên dưới)
//   B6b (đã làm) `SlotHoldService` (`slots/`; NƠI DUY NHẤT ghi `khung_gio`: `hold`, `markBooked`, `release`, `expireLapsedHold`, `holdForInvitation`, `releaseInvitationHold`; không tiêm gì, nhận `em` của người gọi), `state/lapsed-hold.ts` (`cancelLapsedHold`, hàm thuần SQL, không phải provider)
//   B7 (đã làm) `BookingChecksController` (`create/`; `GET /booking/eligibility` và `POST /booking/checks`, chỉ đọc), `BookingEligibilityService`, `BookingChecksService`, `BookingSummaryReader`, `RefundPolicyReader`;
//       dùng lại `SystemConfigModule` mà B3 đã nhập vào `imports` (không nhập lần hai) và thêm `ExamPriceReader` của `pricing/` vào `providers` (chỉ `search/` khai nó; chưa có `PricingModule`; TECH_DEBT)
//   B8 (đã làm) `CreateAppointmentController` + `CreateAppointmentService` (`create/`; `POST /booking/appointments`: ĐƯỜNG GHI đầu tiên chèn `lich_hen`; tiêm `SlotHoldService`, `BookabilityReader`, `BookingSummaryReader.readPricing`,
//       `PAYMENT_PORT`, `APPOINTMENT_NOTIFIER`) và token `APPOINTMENT_CODE_RANDOM` (bộ sinh phần đuôi mã lịch, `useValue: randomCodeSuffix`; test thay bằng `overrideProvider`). Không thêm `imports`.
//   B9 (đã làm) `AppointmentTransitionService` (`state/`; khung của mọi phương thức đổi trạng thái, mới có `expire`; tiêm `DataSource`, `SlotHoldService`, `WAITLIST_PORT`) và `HoldExpiryJob` (`expiry/`; `@Cron` mỗi phút,
//       tắt ở NODE_ENV=test; chỉ `@Cron`, không `ScheduleModule.forRoot()`).
//   B11 (đã làm) `AppointmentQueries` (`queries/`; CHỈ ĐỌC: `findAffectedByLeave` D5, `listAffectedByLeave` D13, `countActiveByShifts` D14) và hai phương thức mới của `AppointmentTransitionService`
//       (`confirmPaid` cho `payment`, `complete` cho `doctor`; lớp này giờ tiêm thêm `APPOINTMENT_NOTIFIER`). Người gọi import kiểu kết quả và `withBookingTransaction` theo đường dẫn file, không qua provider.
// `exports: [AppointmentTransitionService, AppointmentQueries, AppointmentCancellationService]`: CẢ BA là bề mặt DUY NHẤT module khác gọi vào (TRACKING 3.23, 3.24.1): `AppointmentTransitionService` cho `confirmPaid` và
// `complete` (B11), `AppointmentQueries` cho truy vấn lịch bị ảnh hưởng (B11), `AppointmentCancellationService` cho `cancel` (B10: `doctor` duyệt nghỉ phép gọi `cancel` với `HeThong`).
// Không `exports` cổng nào: chỉ service trong module tiêm chúng (`@Inject(PAYMENT_PORT)`…); module khác chỉ `import` file interface để viết bản thật.
//
// THAY `Noop` BẰNG BẢN THẬT (B16, B17) — đã kiểm bằng script Nest (TRACKING 3.6 P2-D): provider khai ngay trong module này THẮNG provider cùng token của module được
// import, nên module thật KHÔNG tự ghi đè từ ngoài. Cách làm: sửa đúng MỘT dòng của cổng đó (thay `useClass: Noop…` bằng `useExisting: <lớp thật>`) và thêm module nguồn
// vào `imports`; module nguồn phải EXPORT CẢ LỚP thật (không chỉ token), nếu không Nest báo không tiêm được. Ví dụ nghỉ phép (B16):
//   imports: [SchedulingModule],  providers: [{ provide: DOCTOR_LEAVE_PORT, useExisting: LeaveReader }, …]   (SchedulingModule đã xuất LeaveReader)
// `SchedulingModule` đòi `DataSource` (doctor B6: `AvailableSlotsReader`); app thật có sẵn toàn cục, còn test dựng riêng module phải cấp bằng `useMocker` (xem `doctor-leave.port.int-spec.ts`).
// `PendingBranchChangesPort` cần adapter `useClass` (admin chỉ có `getPendingEffectiveChanges(chiNhanhId)`). Cảnh báo cho payment, wallet, waitlist (suy ra, chưa đo): các module
// đó `import AppointmentsModule` (gọi `confirmPaid`, `RefundCalculator`, `SlotHoldService`) nên nếu module này cũng import lại họ sẽ thành vòng import module (Nest đòi
// `forwardRef`): đặt bản thật của cổng trong một module nhỏ KHÔNG import `AppointmentsModule`. Test thay cổng bằng bản giả: `overrideProvider(TOKEN).useValue(fake)`.
//
// Chiều phụ thuộc DUY NHẤT: doctor → appointments → scheduling (doctor H20). Module này KHÔNG BAO GIỜ import `DoctorModule`, KHÔNG import `ScheduleModule` và KHÔNG gọi
// `ScheduleModule.forRoot()` (app.module.ts đã đăng ký một lần; gọi thêm thì mọi job `@Cron` chạy gấp đôi, TECH_DEBT dòng 33; job B9, B13 chỉ dùng `@Cron`).
// `DataSource` có sẵn toàn cục từ `DatabaseModule` (như `PatientModule`) nên chưa cần `imports`.
@Module({
  imports: [SchedulingModule, RbacModule, SystemConfigModule],
  controllers: [
    PatientAppointmentsController,
    ReceptionAppointmentsController,
    BookingChecksController,
    CreateAppointmentController,
    DoctorAppointmentsController,
    PatientCancelController,
  ],
  providers: [
    ...BOOKING_PORT_PROVIDERS,
    { provide: APPOINTMENT_CODE_RANDOM, useValue: randomCodeSuffix },
    CreateAppointmentService,
    DoctorAppointmentsService,
    DoctorAppointmentsRepository,
    PatientAppointmentsService,
    PatientAppointmentDetailService,
    PatientAppointmentsRepository,
    OperationsAppointmentsRepository,
    OperationsAppointmentsService,
    ReceptionAppointmentsService,
    BookabilityReader,
    SlotHoldService,
    BookingEligibilityService,
    BookingChecksService,
    BookingSummaryReader,
    RefundPolicyReader,
    ExamPriceReader,
    AppointmentTransitionService,
    AppointmentQueries,
    HoldExpiryJob,
    AppointmentCancellationService,
    CancelPreviewService,
  ],
  exports: [
    AppointmentTransitionService,
    AppointmentQueries,
    AppointmentCancellationService,
  ],
})
export class AppointmentsModule {}
