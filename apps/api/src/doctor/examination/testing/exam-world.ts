import type { DataSource } from 'typeorm';
import { cancelWorld } from '../../../appointments/testing/cancel-world.js';
import type { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import { ExamFixtures } from './exam-fixtures.js';

// Thế giới test của phần khám bệnh (doctor-exam P3; PLAN 5.15): BỌC `cancelWorld` của booking (chính nó bọc `expiryWorld` và `BookingFixtures.world`), không chép. Có sẵn một chi nhánh,
// một bác sĩ phụ trách, một Bệnh nhân (kèm hồ sơ người thân), Lễ tân, hai Quản trị viên và 8 khung giờ 30 phút ngày 10/11/2026 từ 08:00. Lịch dựng qua `w.booked`, nên khung giờ luôn nhất quán
// với trạng thái (`DaTiepDon`, `DaXacNhan`, `HoanThanh` ⇒ `DaDat`). Để dành cho B1, B2: bác sĩ và bệnh nhân thứ hai, chi nhánh thứ hai (QHK-04, QHK-05).
export async function examWorld(db: DataSource, fx: BookingFixtures) {
  const w = await cancelWorld(db, fx);
  return {
    w,
    exam: new ExamFixtures(db),
    doctorId: w.doctor.account.taiKhoanId,
    patientId: w.patientId,
    adminId: w.systemAdmin.account.taiKhoanId,
    /** Lịch đang khám (`DaTiepDon`) ở khung giờ số `slot`: ghi hồ sơ và hoàn thành được */
    inVisit: (slot: number) => w.booked('DaTiepDon', slot),
    /** Lịch đã hoàn thành (`HoanThanh`) ở khung giờ số `slot`: đánh giá được */
    completed: (slot: number) => w.booked('HoanThanh', slot),
    /** Lịch đã xác nhận (`DaXacNhan`), chưa tiếp đón: chưa ghi hồ sơ, chưa đánh giá được */
    confirmed: (slot: number) => w.booked('DaXacNhan', slot),
  };
}

export type ExamWorld = Awaited<ReturnType<typeof examWorld>>;
