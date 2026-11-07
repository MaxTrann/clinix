import type { TrangThaiLichHen } from '../admin/entities/enums.js';

/**
 * Tập trạng thái lịch hẹn "đang hoạt động" (PLAN patient Q12, nhóm chốt 03/11/2026; quy tắc 37 và 52 của `clinix_quy_tac_nghiep_vu.md`).
 * MỘT nguồn duy nhất: ngừng sử dụng hồ sơ người thân (patient B5) dùng để chặn, `booking` sẽ dùng để đếm giới hạn lịch hẹn của hồ sơ đi khám.
 * `DaDoiLich` cố ý KHÔNG nằm trong tập: lịch đó đã được thay bằng lịch mới, lịch mới mới là lịch chặn. `HoanThanh`, `DaHuy`, `VangMat` là lịch đã kết thúc.
 * (Chỗ khác còn viết cứng tập này: `admin/services/service.repository.ts`, ghi ở `docs/TECH_DEBT.md` dòng 73.)
 */
export const ACTIVE_APPOINTMENT_STATES = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
] as const satisfies readonly TrangThaiLichHen[];

export type ActiveAppointmentState = (typeof ACTIVE_APPOINTMENT_STATES)[number];

export function isActiveAppointmentState(
  value: string,
): value is ActiveAppointmentState {
  return (ACTIVE_APPOINTMENT_STATES as readonly string[]).includes(value);
}
