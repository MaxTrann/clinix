import { Module } from '@nestjs/common';
import { PendingBranchChangesModule } from '../admin/branch-change-requests/pending-branch-changes.module.js';
import { SystemConfigModule } from '../admin/system-config/system-config.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { PaymentPortsModule } from '../payment/ports/payment-ports.module.js';
import { PaymentRecorder } from '../payment/ports/payment-recorder.js';
import { PaymentSummaryReader } from '../payment/ports/payment-summary.reader.js';
import { ExamPriceReader } from '../pricing/exam-price.reader.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { LeaveReader } from '../scheduling/leave/leave.reader.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { WalletBalanceReader } from '../wallet/balance/wallet-balance.reader.js';
import { RefundService } from '../wallet/refund/refund.service.js';
import { WalletModule } from '../wallet/wallet.module.js';
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
import { AdminAppointmentsController } from './lists/admin-appointments.controller.js';
import { AdminAppointmentsService } from './lists/admin-appointments.service.js';
import { AppointmentHistoryReader } from './lists/appointment-history.reader.js';
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
import { NoShowSweepService } from './noshow/no-show-sweep.service.js';
import { NoShowJob } from './noshow/no-show.job.js';
import { BookingNotifier } from './notifications/booking-notifier.js';
import { APPOINTMENT_NOTIFIER } from './ports/appointment-notifier.port.js';
import { DOCTOR_LEAVE_PORT } from './ports/doctor-leave.port.js';
import { PAYMENT_PORT, PAYMENT_SUMMARY_PORT } from './ports/payment.port.js';
import { PendingBranchChangesAdapter } from './ports/pending-branch-changes.adapter.js';
import { PENDING_BRANCH_CHANGES_PORT } from './ports/pending-branch-changes.port.js';
import { BOOKING_PORT_PROVIDERS } from './ports/ports.providers.js';
import { REFUND_PORT, WALLET_BALANCE_PORT } from './ports/wallet.port.js';
import { AppointmentQueries } from './queries/appointment-queries.js';
import { AppointmentRescheduleService } from './reschedule/appointment-reschedule.service.js';
import { PatientRescheduleController } from './reschedule/patient-reschedule.controller.js';
import { PatientRescheduleService } from './reschedule/patient-reschedule.service.js';
import { ReceptionReschedulePreviewService } from './reschedule/reception-reschedule-preview.service.js';
import { ReceptionRescheduleController } from './reschedule/reception-reschedule.controller.js';
import { ReceptionRescheduleService } from './reschedule/reception-reschedule.service.js';
import { RescheduleDetailReader } from './reschedule/reschedule-detail.reader.js';
import { ReschedulePreviewService } from './reschedule/reschedule-preview.service.js';
import { RescheduleRequestRepository } from './reschedule/reschedule-request.repository.js';
import { RescheduleRequestService } from './reschedule/reschedule-request.service.js';
import { RescheduleReader } from './reschedule/reschedule.reader.js';
import { BookabilityReader } from './slots/bookability.reader.js';
import { SlotHoldService } from './slots/slot-hold.service.js';
import { AppointmentTransitionService } from './state/appointment-transition.service.js';
import { AdminOverrideController } from './status/admin-override.controller.js';
import { AdminOverrideService } from './status/admin-override.service.js';
import { ReceptionStatusController } from './status/reception-status.controller.js';
import { ReceptionStatusService } from './status/reception-status.service.js';

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
//   B12 (đã làm) `ReceptionStatusController` + `ReceptionStatusService` (`status/`; `POST /reception/appointments/:maLichHen/status`: ĐƯỜNG GHI của Lễ tân; huỷ qua `AppointmentCancellationService`, tiếp đón và Vắng mặt qua hai
//       phương thức mới `checkIn` và `markNoShow` của `AppointmentTransitionService`; dùng lại `RbacModule`, `SystemConfigModule` và cổng `PAYMENT_SUMMARY_PORT` đã có, không thêm `imports`). `checkIn` còn có người gọi
//       ngoài module là `payment` B17 (thêm tên vào AR-07 khi đó), `markNoShow` cho job B13 và Quản trị viên B14.
//   B14 (đã làm) `AdminOverrideController` + `AdminOverrideService` (`status/`; `POST /admin/appointments/:maLichHen/override-status`: ĐƯỜNG GHI của Quản trị viên; rẽ theo đích sang `AppointmentCancellationService` (`QtvOverride`),
//       `markNoShow`, `checkIn` (biến thể Quản trị viên) và `restoreConfirmed` (mới) của `AppointmentTransitionService`, ghi audit `OverrideLichHen` CÙNG giao dịch qua `onChanged` của lõi) và `imports: [AuditModule]` (không import ngược: không vòng).
//       Controller và service của B1 đến B14 (B3 đã thêm RbacModule và SystemConfigModule)
//   B1 (đã làm) `PatientAppointmentsController`, `PatientAppointmentsService`, `PatientAppointmentsRepository` (`lists/`; `GET /patient/appointments`, chỉ đọc)
//   B2 (đã làm) `PatientAppointmentDetailService` (`lists/`; `GET /patient/appointments/:maLichHen`, chỉ đọc; cùng controller và repository của B1)
//   B3 (đã làm) `ReceptionAppointmentsController` + `ReceptionAppointmentsService` (`GET /reception/appointments` và `/:maLichHen`, chỉ đọc, phạm vi chi nhánh của Lễ tân) trên lớp dùng chung
//       `OperationsAppointmentsService` + `OperationsAppointmentsRepository` (cũng là nền của B4 Quản trị viên). `imports: [RbacModule` (phạm vi `ReceptionScopeService`, `BranchAccessPolicy`),
//       `SystemConfigModule` (khung giờ check-in cho `chuyenDuoc` của chi tiết)`]`: cả hai là module lá, không import ngược `AppointmentsModule` nên không tạo vòng.
//   B4 (đã làm) `AdminAppointmentsController` + `AdminAppointmentsService` + `AppointmentHistoryReader` (`lists/`; `GET /admin/appointments` và `/:maLichHen`, chỉ đọc, phạm vi Quản trị viên qua `AdminScopeCtx`; trên nền
//       `OperationsAppointmentsService` của B3, sắp GIẢM dần; chi tiết kèm panel "Lịch sử trạng thái" đọc `nhat_ky_hanh_dong` bằng SQL chỉ đọc ở MỘT file, AR-08). Không thêm `imports`: `RbacModule` đã nhập ở B3 và đã export `AdminScopeGuard`.
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
//   B13 (đã làm) `NoShowSweepService` + `NoShowJob` (`noshow/`; job tự Vắng mặt: `@Cron` mỗi 5 phút, tắt ở NODE_ENV=test, chỉ `@Cron`, không `ScheduleModule.forRoot()`; mỗi lịch một giao dịch qua `markNoShow` với `actor: 'HeThong'`;
//       tiêm `DataSource`, `AppointmentTransitionService`, `SystemConfigService` đã có sẵn: không thêm `imports`, không `exports`).
//   B11 (đã làm) `AppointmentQueries` (`queries/`; CHỈ ĐỌC: `findAffectedByLeave` D5, `listAffectedByLeave` D13, `countActiveByShifts` D14) và hai phương thức mới của `AppointmentTransitionService`
//       (`confirmPaid` cho `payment`, `complete` cho `doctor`; lớp này giờ tiêm thêm `APPOINTMENT_NOTIFIER`). Người gọi import kiểu kết quả và `withBookingTransaction` theo đường dẫn file, không qua provider.
//   reschedule B5 (đã làm) `RescheduleReader` (`reschedule/`; B2, chưa ai đăng ký), `RescheduleRequestService` + `RescheduleRequestRepository` (`reschedule/`; TẠO yêu cầu đổi lịch ngoài chính sách, giao dịch riêng; B6 gọi,
//       B8 và B9 thêm phương thức vào repository) và `RescheduleDetailReader` (hai khoá đổi lịch của chi tiết lịch Bệnh nhân và Lễ tân; tiêm vào `PatientAppointmentDetailService` và `ReceptionAppointmentsService`). Không `imports`
//       và không `exports` mới: mọi người gọi cùng module. B4 cũng đăng ký `RescheduleReader`: khi gộp chỉ giữ MỘT dòng.
//   reschedule B6 (đã làm; TRACKING reschedule 1.10) `PatientRescheduleController` (`reschedule/`; `GET …/reschedule-preview` và `POST …/reschedule` của Bệnh nhân, `@Roles('BenhNhan')` trên từng route), `ReschedulePreviewService`
//       (CHỈ ĐỌC, một lần `runReadOnly`) và `PatientRescheduleService` (ghép `AppointmentRescheduleService` của B4 với `RescheduleRequestService` của B5, không SQL, không giao dịch). Không `imports`, không `exports`, không cổng mới.
//   reschedule B7 (đã làm; TRACKING reschedule 1.11) `ReceptionRescheduleController` (`reschedule/`; `GET …/reschedule-preview` và `POST …/reschedule` của Lễ tân đổi hộ, `@Roles('LeTan')` trên từng route),
//       `ReceptionReschedulePreviewService` (CHỈ ĐỌC, một lần `runReadOnly`) và `ReceptionRescheduleService` (gọi `AppointmentRescheduleService` của B4 với `actor` `DoiHo`, ghi Audit `DoiLichHo` trong `afterWrite`, không SQL,
//       không giao dịch). Không `imports` (`AuditModule` và `RbacModule` đã nhập), không `exports`, không cổng mới.
// `exports: [AppointmentTransitionService, AppointmentQueries, AppointmentCancellationService]`: CẢ BA là bề mặt DUY NHẤT module khác gọi vào (TRACKING 3.23, 3.24.1): `AppointmentTransitionService` cho `confirmPaid` và
// `complete` (B11), `AppointmentQueries` cho truy vấn lịch bị ảnh hưởng (B11), `AppointmentCancellationService` cho `cancel` (B10: `doctor` duyệt nghỉ phép gọi `cancel` với `HeThong`).
// Không `exports` cổng nào: chỉ service trong module tiêm chúng (`@Inject(PAYMENT_PORT)`…); module khác chỉ `import` file interface để viết bản thật.
//
// THAY `Noop` BẰNG BẢN THẬT (B16, B17) — đã kiểm bằng script Nest (TRACKING 3.6 P2-D): provider khai ngay trong module này THẮNG provider cùng token của module được
// import, nên module thật KHÔNG tự ghi đè từ ngoài. Cách làm: sửa đúng MỘT dòng của cổng đó (thay `useClass: Noop…` bằng `useExisting: <lớp thật>`) và thêm module nguồn
// vào `imports`; module nguồn phải EXPORT CẢ LỚP thật (không chỉ token), nếu không Nest báo không tiêm được. Nghỉ phép (B16a, ĐÃ LÀM) là ví dụ chuẩn:
//   imports: [SchedulingModule],  providers: [{ provide: DOCTOR_LEAVE_PORT, useExisting: LeaveReader }, …]   (SchedulingModule đã xuất LeaveReader)
// `SchedulingModule` đòi `DataSource` (doctor B6: `AvailableSlotsReader`); app thật có sẵn toàn cục, còn test dựng riêng module phải cấp bằng `useMocker` (xem `doctor-leave.port.int-spec.ts`).
// `PendingBranchChangesPort` (B16b, ĐÃ LÀM, TRACKING 3.50) là adapter `useClass` (admin chỉ có `getPendingEffectiveChanges(em, chiNhanhId)` theo chi nhánh). Cảnh báo cho payment, wallet, waitlist (suy ra ở P2, ĐÃ ĐO ở B7 bằng Nest thật: HDT-11, TRACKING 3.47.2): các module
// đó `import AppointmentsModule` (gọi `confirmPaid`, `RefundCalculator`, `SlotHoldService`) nên nếu module này cũng import lại họ sẽ thành vòng import module (Nest đòi
// `forwardRef`): đặt bản thật của cổng trong một module nhỏ KHÔNG import `AppointmentsModule`. Test thay cổng bằng bản giả: `overrideProvider(TOKEN).useValue(fake)`.
//
// reschedule B4 (đã làm; TRACKING reschedule 1.7): `RescheduleReader` (B2) và `AppointmentRescheduleService` (`reschedule/`; LÕI đổi lịch, MỘT thân giao dịch cho tự đổi, đổi hộ và duyệt yêu cầu) vào `providers`. KHÔNG `exports`: các
// đường gọi (route Bệnh nhân B6, Lễ tân B7, duyệt B9) đều nằm trong module này; không `imports` mới (cổng danh sách chờ vẫn là `Noop`, cổng thông báo là `BookingNotifier`). Tiêm `DataSource`, `SlotHoldService`,
// `AppointmentTransitionService`, `APPOINTMENT_NOTIFIER`, `WAITLIST_PORT`, `APPOINTMENT_CODE_RANDOM` đã có sẵn; `RescheduleReader` cần thêm `BookabilityReader` và `SystemConfigService` (đã nhập qua `SystemConfigModule`).
//
// Chiều phụ thuộc DUY NHẤT: doctor → appointments → scheduling (doctor H20). Module này KHÔNG BAO GIỜ import `DoctorModule`, KHÔNG import `ScheduleModule` và KHÔNG gọi
// `ScheduleModule.forRoot()` (app.module.ts đã đăng ký một lần; gọi thêm thì mọi job `@Cron` chạy gấp đôi, TECH_DEBT dòng 33; job B9, B13 chỉ dùng `@Cron`).
// `DataSource` có sẵn toàn cục từ `DatabaseModule` (như `PatientModule`) nên chưa cần `imports`.
// B15 (đã làm): cổng `AppointmentNotifier` hết là `Noop` ở ĐÂY (module thật chạy trong app; `ports.providers.ts`, bản `Noop` và mảng `BOOKING_PORT_PROVIDERS` giữ nguyên cho test dựng riêng). Token đó bị LOẠI khỏi phần trải
// bằng `filter` rồi khai lại một lần với `BookingNotifier` (`notifications/`), nên không dựa vào thứ tự "provider sau thắng": P2-D chỉ kiểm provider của module so với provider của module được import, không kiểm hai provider
// cùng token trong cùng một mảng. `BookingNotifier` không có phụ thuộc nào (nhận `em` của người gọi) nên cả bốn spec dựng riêng module này vẫn dựng được mà không cần `MailModule` hay `ConfigService`; worker gửi thư nằm
// ở `NotificationsModule` (giai đoạn sau) vì lý do đó.
// B16a (đã làm; nửa `doctor` của B16, TRACKING 3.39): cổng nghỉ phép hết là `Noop` ở ĐÂY. `imports` đã có `SchedulingModule` từ B6a nên chỉ đổi phần `providers`: token `DOCTOR_LEAVE_PORT` cũng bị LOẠI khỏi phần trải rồi khai lại
// bằng `useExisting: LeaveReader` (một thể hiện duy nhất, của `SchedulingModule`; `LeaveReader` không có phụ thuộc constructor nên không cần thêm `useMocker` ở các spec dựng riêng module). Nửa `admin` là B16b (đoạn cuối).
// payment B7 (B17a lần 1, đã làm; KHÔNG phải B7 `BookingChecksController` ở danh sách trên; TRACKING booking 3.47): ba cổng thanh toán và ví hết là `Noop` ở ĐÂY. `imports` thêm `PaymentPortsModule` và `WalletModule`, hai module LÁ của payment và wallet, không nhập `AppointmentsModule` nên KHÔNG vòng và
// không `forwardRef` (đã đo bằng Nest thật: BPO-01, AR-03 `walkModuleTree`, `payment/architecture.int-spec.ts` HDT-11). Ba token `PAYMENT_PORT`, `PAYMENT_SUMMARY_PORT`, `WALLET_BALANCE_PORT` cũng bị LOẠI khỏi phần trải rồi khai lại bằng `useExisting` lớp thật
// (`PaymentRecorder` và `PaymentSummaryReader` của `PaymentPortsModule`, `WalletBalanceReader` của `WalletModule`; mỗi lớp là MỘT thể hiện của module lá, hai module lá đã xuất cả lớp). Lớp thật chỉ đòi `DataSource` hoặc provider cùng module nên các spec dựng riêng module này
// vẫn chỉ cần `useMocker` cho `DataSource`. BPO-06 canh mỗi token có ĐÚNG MỘT provider (bỏ token khỏi `REAL_PORT_TOKENS` không đổi hành vi nên không ca nào khác bắt được).
// payment B9 (B17a lần 2, đã làm; TRACKING booking 3.48, issue #459): cổng hoàn tiền hết là `Noop` ở ĐÂY. Token `REFUND_PORT` cũng bị LOẠI khỏi phần trải rồi khai lại bằng `useExisting: RefundService` (MỘT thể hiện của `WalletModule`, đã xuất cả lớp từ B8);
// `imports` KHÔNG đổi (`WalletModule` đã nhập từ B7) nên không thêm cạnh module nào, không vòng, không `forwardRef`. `RefundService` đã là provider của `WalletModule` nên Nest đã dựng nó mỗi lần dựng module: các spec dựng riêng vẫn chỉ cần `useMocker` cho `DataSource`.
// `cancel` đọc `amountRefundable` của `PaymentSummaryPort` (Q15) và gọi `refund` SAU commit; `wallet` chỉ thực hiện lại số đã ghi ở `lich_su_hoan_tien`, không tự tính lại (Q16 phương án (d)).
// B16b (đã làm; nửa `admin` của B16, TRACKING booking 3.50, issue #249): cổng thay đổi chi nhánh hết là `Noop` ở ĐÂY. Token `PENDING_BRANCH_CHANGES_PORT` cũng bị LOẠI khỏi phần trải rồi khai lại bằng `useClass: PendingBranchChangesAdapter`
// (`ports/`; ADAPTER chứ không `useExisting`: admin trả danh sách theo chi nhánh, booking hỏi theo từng khung giờ) và `imports` thêm `PendingBranchChangesModule` của admin (module LÁ, `imports` rỗng, đã xuất CẢ lớp
// `PendingBranchChangesReader`) nên KHÔNG vòng, không `forwardRef`. Lớp reader không có phụ thuộc constructor nên các spec dựng riêng module này vẫn chỉ cần `useMocker` cho `DataSource`. Còn `Noop`: `WAITLIST_PORT`.
const REAL_PORT_TOKENS: readonly unknown[] = [
  APPOINTMENT_NOTIFIER,
  DOCTOR_LEAVE_PORT,
  PAYMENT_PORT,
  PAYMENT_SUMMARY_PORT,
  WALLET_BALANCE_PORT,
  REFUND_PORT,
  PENDING_BRANCH_CHANGES_PORT,
];
const PORT_PROVIDERS_STILL_NOOP = BOOKING_PORT_PROVIDERS.filter(
  (provider) =>
    !('provide' in provider && REAL_PORT_TOKENS.includes(provider.provide)),
);

@Module({
  imports: [
    SchedulingModule,
    RbacModule,
    SystemConfigModule,
    AuditModule,
    PaymentPortsModule,
    WalletModule,
    PendingBranchChangesModule,
  ],
  controllers: [
    PatientAppointmentsController,
    ReceptionAppointmentsController,
    AdminAppointmentsController,
    BookingChecksController,
    CreateAppointmentController,
    DoctorAppointmentsController,
    PatientCancelController,
    PatientRescheduleController,
    ReceptionRescheduleController,
    ReceptionStatusController,
    AdminOverrideController,
  ],
  providers: [
    ...PORT_PROVIDERS_STILL_NOOP,
    { provide: APPOINTMENT_NOTIFIER, useClass: BookingNotifier },
    { provide: DOCTOR_LEAVE_PORT, useExisting: LeaveReader },
    { provide: PAYMENT_PORT, useExisting: PaymentRecorder },
    { provide: PAYMENT_SUMMARY_PORT, useExisting: PaymentSummaryReader },
    { provide: WALLET_BALANCE_PORT, useExisting: WalletBalanceReader },
    { provide: REFUND_PORT, useExisting: RefundService },
    {
      provide: PENDING_BRANCH_CHANGES_PORT,
      useClass: PendingBranchChangesAdapter,
    },
    { provide: APPOINTMENT_CODE_RANDOM, useValue: randomCodeSuffix },
    CreateAppointmentService,
    RescheduleReader,
    AppointmentRescheduleService,
    DoctorAppointmentsService,
    DoctorAppointmentsRepository,
    PatientAppointmentsService,
    PatientAppointmentDetailService,
    PatientAppointmentsRepository,
    OperationsAppointmentsRepository,
    OperationsAppointmentsService,
    ReceptionAppointmentsService,
    AdminAppointmentsService,
    AppointmentHistoryReader,
    ReceptionStatusService,
    AdminOverrideService,
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
    NoShowSweepService,
    NoShowJob,
    AppointmentCancellationService,
    CancelPreviewService,
    RescheduleRequestRepository,
    RescheduleRequestService,
    RescheduleDetailReader,
    PatientRescheduleService,
    ReschedulePreviewService,
    ReceptionRescheduleService,
    ReceptionReschedulePreviewService,
  ],
  exports: [
    AppointmentTransitionService,
    AppointmentQueries,
    AppointmentCancellationService,
  ],
})
export class AppointmentsModule {}
