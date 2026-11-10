import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { PatientAppointmentsController } from './lists/patient-appointments.controller.js';
import { PatientAppointmentsRepository } from './lists/patient-appointments.repository.js';
import { PatientAppointmentsService } from './lists/patient-appointments.service.js';
import { BOOKING_PORT_PROVIDERS } from './ports/ports.providers.js';
import { BookabilityReader } from './slots/bookability.reader.js';

// Module `booking` (PLAN booking 5.1, 5.10; TRACKING 3.3 P1-B, 3.6 P2-B, P2-D). P1 dựng vỏ; P2 thêm TÁM cổng sang module khác, mỗi cổng gắn bản `Noop` mặc định
// (`ports/ports.providers.ts`). Mọi thứ khác P1 làm ra (ma trận trạng thái, hằng và mã lỗi, `withBookingTransaction`, `lock-order`) là hàm hoặc hằng thuần mà nơi
// khác dùng bằng `import`; ba file của patient B5 cũng là hàm thuần nhận `EntityManager`. Đăng ký vào `AppModule` MỘT lần ở P1 để các task sau chỉ thêm provider
// trong `appointments/`, không đụng lại `app.module.ts` (file dùng chung), và để test kiến trúc AR-03 kiểm được chiều phụ thuộc.
//
// Task nào thêm gì (providers; exports là các dịch vụ DÙNG CHUNG cho doctor, payment, wallet, waitlist):
//   B6  `SlotHoldService` (imports: SchedulingModule)          B9   `AppointmentTransitionService` (nơi DUY NHẤT ghi `lich_hen.trang_thai`, H7)
//   B10 `AppointmentCancellationService`                        B11  `AppointmentQueries` (+ `confirmPaid`, `complete`, `findAffectedByLeave`, D13, D14)
//   B3 thêm RbacModule, B14 thêm AuditModule; controller và service của B1 đến B14
//   B1 (đã làm) `PatientAppointmentsController`, `PatientAppointmentsService`, `PatientAppointmentsRepository` (`lists/`; `GET /patient/appointments`, chỉ đọc)
//   B6a (đã làm) `BookabilityReader` (`slots/`; đọc dữ kiện cho `evaluateBookability`, chỉ đọc; cần `BranchHoursReader` của SchedulingModule và hai cổng bên dưới); B6b thêm `SlotHoldService`
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
  imports: [SchedulingModule],
  controllers: [PatientAppointmentsController],
  providers: [
    ...BOOKING_PORT_PROVIDERS,
    PatientAppointmentsService,
    PatientAppointmentsRepository,
    BookabilityReader,
  ],
})
export class AppointmentsModule {}
