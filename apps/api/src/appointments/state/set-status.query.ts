import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';

// Câu `UPDATE lich_hen` chung của `checkIn` (`DaXacNhan` sang `DaTiepDon`) và `markNoShow` (sang `VangMat`) (task B12; TRACKING 3.26 B12-C, B12-D). Là nơi ghi `lich_hen.trang_thai` thứ ba của module
// (cùng `lapsed-hold.ts`, `cancel-appointment.query.ts`; luật AR-06: `UPDATE lich_hen` chỉ ở `appointments/state/`). Hai trạng thái đích này KHÔNG đổi khung giờ (vẫn `DaDat`, INV-3) và không có cột mốc
// thời gian riêng (`cap_nhat_lan_cuoi` tự cập nhật). Nhận `em` của người gọi, KHÔNG mở giao dịch; người gọi đã khoá `lich_hen` theo khoá chính (tầng 6, quy tắc 7).

// `trang_thai = ?` là trạng thái nguồn đọc dưới khoá: lưới an toàn thứ hai (đúng 1 hàng)
const SET_STATUS_SQL = `UPDATE lich_hen SET trang_thai = ?
WHERE lich_hen_id = ? AND trang_thai = ?`;

/** Đổi `trang_thai` từ `from` sang `to` CHỈ khi lịch còn đúng `from`. `true` khi đúng 1 hàng bị ảnh hưởng. */
export async function setStatus(
  em: EntityManager,
  input: { lichHenId: string; from: TrangThaiLichHen; to: TrangThaiLichHen },
): Promise<boolean> {
  const result: { affectedRows?: number } = await em.query(SET_STATUS_SQL, [
    input.to,
    input.lichHenId,
    input.from,
  ]);
  return result.affectedRows === 1;
}
