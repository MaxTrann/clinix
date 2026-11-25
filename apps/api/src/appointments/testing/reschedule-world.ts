import type { DataSource, EntityManager } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import { KhungGio } from '../../admin/entities/khung-gio.entity.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import {
  lockRequestCreation,
  lockRescheduleChain,
} from '../reschedule/reschedule-locks.js';
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
 * Giữ chuỗi khoá của đổi lịch THEO THỨ TỰ PLAN reschedule 5.4 để test `locked` của `RescheduleReader` đứng đúng điều kiện đầu vào. Từ reschedule B1 hàm này GỌI HÀM THẬT
 * (`lockRescheduleChain`, `reschedule-locks.ts`) thay cho bản chép tay của B2; chữ ký giữ nguyên nên các nơi gọi không đổi. Hai ca của B2 vẫn phải chạy ở chế độ `locked` dù dịch vụ thật sẽ từ chối
 * TRƯỚC mọi khoá: khung giờ đích TRÙNG khung giờ cũ (KDL-05; chỉ có MỘT khung giờ để khoá) và khung giờ đích KHÔNG TỒN TẠI (KDL-06; hàm thật dừng ở `khung_gio`, ca chỉ đọc tiếp).
 */
export async function holdRescheduleChain(
  em: EntityManager,
  located: RescheduleLocated,
  khungGioMoiId: string,
): Promise<void> {
  const target = {
    benhNhanId: located.benhNhanId,
    hoSoNguoiThanId: located.hoSoNguoiThanId,
    bacSiId: located.bacSiId,
    lichHenId: located.lichHenId,
  };
  const locks =
    khungGioMoiId === located.khungGioCuId
      ? await lockRequestCreation(em, {
          ...target,
          khungGioMongMuonId: khungGioMoiId,
        })
      : await lockRescheduleChain(em, {
          ...target,
          khungGioCuId: located.khungGioCuId,
          khungGioMoiId,
        });
  if (locks.kind === 'Missing' && locks.table !== 'khung_gio')
    throw new Error(`thiếu hàng ${locks.table} khi giữ chuỗi khoá`);
}
