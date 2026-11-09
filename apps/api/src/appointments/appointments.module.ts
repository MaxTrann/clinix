import { Module } from '@nestjs/common';

// Module `booking` (PLAN booking 5.1, 5.10; TRACKING 3.3 P1-B). P1 chỉ là VỎ: chưa có provider, controller hay export nào, vì mọi thứ P1 làm ra (ma trận trạng thái,
// hằng và mã lỗi, `withBookingTransaction`, `lock-order`) là hàm hoặc hằng thuần mà nơi khác dùng bằng `import`; ba file của patient B5 (`findActiveAppointments`,
// `lockVisitProfile`…) cũng là hàm thuần nhận `EntityManager`. Đăng ký vào `AppModule` MỘT lần ở đây để các task sau chỉ thêm provider trong `appointments/`,
// không đụng lại `app.module.ts` (file dùng chung), và để test kiến trúc AR-03 kiểm được chiều phụ thuộc.
//
// Task nào thêm gì (providers; exports là các dịch vụ DÙNG CHUNG cho doctor, payment, wallet, waitlist):
//   P2  token DI của các cổng cùng bản `Noop` (payment, wallet, waitlist, nghỉ phép, thay đổi chi nhánh, thông báo)
//   B6  `SlotHoldService` (imports: SchedulingModule)          B9   `AppointmentTransitionService` (nơi DUY NHẤT ghi `lich_hen.trang_thai`, H7)
//   B10 `AppointmentCancellationService`                        B11  `AppointmentQueries` (+ `confirmPaid`, `complete`, `findAffectedByLeave`, D13, D14)
//   B3 thêm RbacModule, B14 thêm AuditModule; controller và service của B1 đến B14
//
// Chiều phụ thuộc DUY NHẤT: doctor → appointments → scheduling (doctor H20). Module này KHÔNG BAO GIỜ import `DoctorModule`, KHÔNG import `ScheduleModule` và KHÔNG gọi
// `ScheduleModule.forRoot()` (app.module.ts đã đăng ký một lần; gọi thêm thì mọi job `@Cron` chạy gấp đôi, TECH_DEBT dòng 33; job B9, B13 chỉ dùng `@Cron`).
// `DataSource` có sẵn toàn cục từ `DatabaseModule` (như `PatientModule`) nên P1 chưa cần `imports`.
@Module({})
export class AppointmentsModule {}
