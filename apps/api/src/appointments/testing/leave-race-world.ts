import type { DataSource } from 'typeorm';
import type { AppointmentCancellationPort } from '../../doctor/leave-approval/appointment-cancellation.port.js';
import { DoctorLeaveRepository } from '../../doctor/leave-requests/doctor-leave.repository.js';
import { DoctorLeaveService } from '../../doctor/leave-requests/doctor-leave.service.js';
import { LeaveNotifier } from '../../doctor/notifications/leave-notifier.js';
import {
  createLeaveServices,
  SYSTEM,
} from '../../doctor/testing/leave-approval-world.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import type { DoctorLeavePort } from '../ports/doctor-leave.port.js';
import { BOOKABLE_DAY, type BookingFixtures } from './booking-fixtures.js';
import {
  createAppointmentWorld,
  resetBookingData,
} from './create-appointment-world.js';

// Dựng dữ liệu dùng chung của các ca nghỉ phép THẬT của B16a (TRACKING 3.39 B16a-E; DL-17, CG-05, LRP-01, DT-09, LRP-02, DT-17): "thế giới tạo lịch" của B8 với cổng nghỉ phép là `LeaveReader` THẬT (hay một cổng bọc
// nó), cộng các lớp THẬT của `doctor` (gửi yêu cầu nghỉ, duyệt, sweeper) dựng tay như `doctor/testing/leave-approval-world.ts` (DÙNG LẠI `createLeaveServices`, không chép). Chỉ IMPORT lớp của `doctor`; nằm trong `testing/`
// nên luật AR-03 (chiều `doctor → appointments → scheduling`, quét mã nguồn không tính `testing/` và file test) không vướng. Mọi dữ liệu là giả; ô i của thế giới bắt đầu 08:00 + 30 phút × i giờ Việt Nam ngày `BOOKABLE_DAY`.

/**
 * Thế giới tạo lịch với cổng nghỉ phép `leave` (mặc định `LeaveReader` thật) và bộ lớp thật của `doctor`:
 * `submit` (bác sĩ gửi yêu cầu nghỉ, khoá `bac_si` FOR UPDATE), `services.approval` (Quản trị viên duyệt, bước (2) huỷ lịch qua `cancel` và `findAffectedByLeave` THẬT của booking), `services.sweeper`.
 */
export async function leaveRaceWorld(
  db: DataSource,
  fx: BookingFixtures,
  leave: DoctorLeavePort = new LeaveReader(),
) {
  const w = await createAppointmentWorld(db, fx, { leave });
  const services = createLeaveServices(db);
  const submit = new DoctorLeaveService(
    new DoctorLeaveRepository(db),
    new LeaveReader(),
    new BranchHoursReader(),
    new LeaveNotifier(),
    services.realPort,
  );
  const adminId = w.systemAdmin.account.taiKhoanId;
  return {
    ...w,
    services,
    submit,
    adminId,
    /** Bác sĩ gửi yêu cầu nghỉ CẢ NGÀY `BOOKABLE_DAY`, rồi Quản trị viên duyệt ngay: hai bước THẬT của `doctor` (mỗi bước khoá `bac_si` FOR UPDATE). */
    submitAndApprove: async () => {
      const created = await submit.create(w.doctorId, {
        hinhThuc: 'CaNgay',
        tuNgay: BOOKABLE_DAY,
        denNgay: BOOKABLE_DAY,
        ca: null,
        lyDo: 'Việc gia đình',
      });
      const approved = await services.approval.approve(
        SYSTEM,
        adminId,
        created.yeuCauNghiPhepId,
      );
      return { created, approved };
    },
    /** Đầu mỗi vòng: không lịch hẹn, khung giờ `ConTrong`, không yêu cầu nghỉ nào (bác sĩ, ca, khung giờ giữ nguyên). */
    resetRound: async () => {
      await resetBookingData(db);
      await db.query('DELETE FROM yeu_cau_nghi_phep');
    },
  };
}

export type LeaveRaceWorld = Awaited<ReturnType<typeof leaveRaceWorld>>;

/**
 * Bọc một cổng huỷ để bước (2) của duyệt "chết" (ném lỗi) từ lần huỷ thứ `okCalls + 1`; `findAffected` và các lần huỷ đầu chạy THẬT qua `inner` (DT-17, nếp DH-07 của `doctor`).
 * Lỗi ném ở `cancelForLeave` được `LeaveCancellationRunner` bắt: duyệt trả `hoanTat: false` còn `DaDuyet` đã commit, y như tiến trình dừng giữa chừng.
 */
export function dyingAfter(
  inner: AppointmentCancellationPort,
  okCalls: number,
): AppointmentCancellationPort {
  let calls = 0;
  return {
    findAffected: (filter) => inner.findAffected(filter),
    cancelForLeave: (maLichHen) => {
      calls += 1;
      if (calls > okCalls) throw new Error('tiến trình dừng giữa hai bước');
      return inner.cancelForLeave(maLichHen);
    },
  };
}
