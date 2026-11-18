import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { toSecond } from '../../common/time/time.js';

// Câu `UPDATE lich_hen` chung của `checkIn` (`DaXacNhan` hoặc `VangMat` sang `DaTiepDon`), `markNoShow` (sang `VangMat`) và `restoreConfirmed` (sang `DaXacNhan`) (task B12, B14; TRACKING 3.26 B12-C, B12-D).
// Là nơi ghi `lich_hen.trang_thai` thứ ba của module (cùng `lapsed-hold.ts`, `cancel-appointment.query.ts`; luật AR-06: `UPDATE lich_hen` chỉ ở `appointments/state/`). Ba trạng thái đích này KHÔNG đổi khung giờ
// (vẫn `DaDat`, INV-3). Nhận `em` của người gọi, KHÔNG mở giao dịch; người gọi đã khoá `lich_hen` theo khoá chính (tầng 6, quy tắc 7).
//
// MỐC THỜI GIAN (booking B19, TRACKING 3.46 B19-D (a)): mốc nằm trong CÙNG câu `UPDATE` với `trang_thai`, nên cùng giao dịch và không thêm khoá. Quy tắc theo trạng thái ĐÍCH, không rẽ theo nguồn:
//  - `DaTiepDon`: ghi `thoi_diem_tiep_don` = `now` (đã `toSecond`).
//  - `DaXacNhan` (khôi phục) và `VangMat`: XOÁ `thoi_diem_tiep_don` (lịch không còn ở bước tiếp đón). `thoi_diem_xac_nhan` giữ nguyên; `thoi_diem_hoan_thanh` không cần xoá vì không vai nào đi ra khỏi `HoanThanh` (Q24).
// Kiểu hẹp ba đích: thêm đích mới thì biên dịch báo, người sửa phải quyết mốc của đích đó.

// `trang_thai = ?` là trạng thái nguồn đọc dưới khoá: lưới an toàn thứ hai (đúng 1 hàng). Mọi câu bắt đầu bằng `UPDATE lich_hen SET trang_thai = ?` (nhiều test khớp đầu câu này).
const SET_STATUS_SQL = {
  DaTiepDon: `UPDATE lich_hen SET trang_thai = ?, thoi_diem_tiep_don = ?
WHERE lich_hen_id = ? AND trang_thai = ?`,
  DaXacNhan: `UPDATE lich_hen SET trang_thai = ?, thoi_diem_tiep_don = NULL
WHERE lich_hen_id = ? AND trang_thai = ?`,
  VangMat: `UPDATE lich_hen SET trang_thai = ?, thoi_diem_tiep_don = NULL
WHERE lich_hen_id = ? AND trang_thai = ?`,
} as const;

export type SetStatusInput = {
  lichHenId: string;
  from: TrangThaiLichHen;
} & (
  | {
      to: 'DaTiepDon';
      /** Mốc của lượt (người gọi đã `toSecond(nowVN())`); hàm KHÔNG tự đọc đồng hồ (H8) */
      now: Date;
    }
  | { to: 'DaXacNhan' | 'VangMat' }
);

/** Đổi `trang_thai` từ `from` sang `to` CHỈ khi lịch còn đúng `from`, kèm mốc theo đích. `true` khi đúng 1 hàng bị ảnh hưởng. */
export async function setStatus(
  em: EntityManager,
  input: SetStatusInput,
): Promise<boolean> {
  const params =
    input.to === 'DaTiepDon'
      ? [input.to, toSecond(input.now), input.lichHenId, input.from]
      : [input.to, input.lichHenId, input.from];
  const result: { affectedRows?: number } = await em.query(
    SET_STATUS_SQL[input.to],
    params,
  );
  return result.affectedRows === 1;
}
