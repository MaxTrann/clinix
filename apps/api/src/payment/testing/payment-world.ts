import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import { PAYMENT_DEPOSIT, PaymentFixtures } from './payment-fixtures.js';

// Thế giới test của `payment/` (payment P4; PLAN payment 5.15): Bệnh nhân KÈM VÍ, bác sĩ, ca với 8 khung giờ ngày đặt được, và hàm dựng lịch có cọc theo CHỈ SỐ khung giờ.
// Dùng lại `BookingFixtures.world()` nguyên vẹn; test của B1 trở đi thêm hàm riêng của mình ở đây thay vì dựng lại thế giới.

export async function paymentWorld(db: DataSource) {
  const booking = new BookingFixtures(db);
  const base = await booking.world();
  const fixtures = new PaymentFixtures(db, booking);
  const slotId = (index: number): string => {
    const id = base.slotIds[index];
    if (id === undefined)
      throw new Error(`Khung giờ số ${index} không tồn tại`);
    return id;
  };
  return {
    ...base,
    booking,
    fixtures,
    patientId: base.patient.account.taiKhoanId,
    slotId,
    /** Lịch ở `trangThai` (mặc định `ChoThanhToan`) có cọc `coc` (mặc định `PAYMENT_DEPOSIT`) ở khung giờ số `slot`, của Bệnh nhân của world */
    appointment: (
      slot: number,
      options: { trangThai?: TrangThaiLichHen; coc?: string } = {},
    ) =>
      booking.appointmentIn(options.trangThai ?? 'ChoThanhToan', {
        doctor: base.doctor.profile,
        khungGioId: slotId(slot),
        patientId: base.patient.account.taiKhoanId,
        tienCocSnapshot: options.coc ?? PAYMENT_DEPOSIT,
      }),
    /** Chuỗi đổi lịch `length` lịch dùng các khung giờ số 0…length-1 của world (cũ nhất trước) */
    chain: (length: number) =>
      fixtures.rescheduleChain({
        doctor: base.doctor.profile,
        patientId: base.patient.account.taiKhoanId,
        slotIds: Array.from({ length }, (_unused, index) => slotId(index)),
      }),
  };
}

export type PaymentWorld = Awaited<ReturnType<typeof paymentWorld>>;
