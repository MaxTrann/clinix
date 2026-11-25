import type { DataSource, EntityManager } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import { KhungGio } from '../../admin/entities/khung-gio.entity.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import type { RescheduleLocated } from '../reschedule/reschedule.reader.js';
import {
  nextAppointmentCode,
  type BookingFixtures,
} from './booking-fixtures.js';

// Hạ tầng test của đổi lịch trên MySQL thật (reschedule B2, PLAN reschedule 5.4, 7.1). Chỉ dùng trong test (thư mục `testing/`, AR-01 bỏ qua).

/**
 * Chuỗi `lich_hen_truoc_id` gồm `length` lịch (kể cả lịch cuối), đi từ lịch gốc: `length − 1` lịch `DaDoiLich` nối nhau rồi lịch CUỐI `DaXacNhan` ở `khungGioId` (khung giờ `DaDat`).
 * Các lịch `DaDoiLich` dùng chung một khung giờ được: cột sinh `khung_gio_dang_giu` chỉ có ở trạng thái đang giữ khung giờ. Trả lịch cuối (lịch sẽ được đổi).
 */
export async function buildRescheduleChain(
  db: DataSource,
  fx: BookingFixtures,
  input: {
    doctor: BacSi;
    patientId: string;
    khungGioId: string;
    length: number;
  },
): Promise<LichHen> {
  if (input.length < 1) throw new Error('chuỗi phải có ít nhất một lịch');
  const slot = await db
    .getRepository(KhungGio)
    .findOneByOrFail({ khungGioId: input.khungGioId });
  let previousId: string | null = null;
  for (let index = 1; index < input.length; index += 1) {
    const replaced: LichHen = await fx.admin.appointment(
      input.doctor,
      slot,
      input.patientId,
      {
        trangThai: 'DaDoiLich',
        lichHenTruocId: previousId,
        maLichHen: nextAppointmentCode(),
      },
    );
    previousId = replaced.lichHenId;
  }
  const last = await fx.appointmentIn('DaXacNhan', {
    doctor: input.doctor,
    khungGioId: input.khungGioId,
    patientId: input.patientId,
  });
  if (previousId !== null)
    await db.query(
      'UPDATE lich_hen SET lich_hen_truoc_id = ? WHERE lich_hen_id = ?',
      [previousId, last.lichHenId],
    );
  return last;
}

/**
 * Giữ chuỗi khoá của đổi lịch THEO THỨ TỰ PLAN reschedule 5.4 (tầng 2 `benh_nhan`, 3 `ho_so_nguoi_than`, 4 `bac_si`, 5 hai `khung_gio` THEO ID TĂNG DẦN, 6 `lich_hen`) để test `locked`
 * của `RescheduleReader` đứng đúng điều kiện đầu vào. CHỈ DÙNG TRONG TEST: bản thật là `reschedule-locks.ts` của reschedule B1; khi B1 có mã thì thay hàm này.
 * Id so bằng BigInt (so chuỗi thì "9" lớn hơn "10").
 */
export async function holdRescheduleChain(
  em: EntityManager,
  located: RescheduleLocated,
  khungGioMoiId: string,
): Promise<void> {
  await em.query('SELECT 1 FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE', [
    located.benhNhanId,
  ]);
  if (located.hoSoNguoiThanId !== null)
    await em.query(
      'SELECT 1 FROM ho_so_nguoi_than WHERE ho_so_nguoi_than_id = ? FOR UPDATE',
      [located.hoSoNguoiThanId],
    );
  await em.query('SELECT 1 FROM bac_si WHERE tai_khoan_id = ? FOR SHARE', [
    located.bacSiId,
  ]);
  const slotIds = [located.khungGioCuId, khungGioMoiId].sort((a, b) =>
    BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0,
  );
  for (const slotId of slotIds)
    await em.query(
      'SELECT 1 FROM khung_gio WHERE khung_gio_id = ? FOR UPDATE',
      [slotId],
    );
  await em.query('SELECT 1 FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE', [
    located.lichHenId,
  ]);
}
