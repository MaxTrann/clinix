import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { toSecond } from '../../common/time/time.js';
import { parseVnDateTime } from '../slots/slot-lock.js';

// Hai câu SQL của HUỶ lịch hẹn (B10; TRACKING 3.23 B10-D), tách khỏi `appointment-transition.service.ts` theo nếp `lapsed-hold.ts` để lớp dịch vụ chỉ còn khuôn bảy bước. Đây là nơi ghi
// `lich_hen.trang_thai` thứ hai của module (cùng `lapsed-hold.ts` của hết hạn giữ chỗ; luật AR-06: `UPDATE lich_hen` chỉ ở `appointments/state/`). Cả hai nhận `em` của người gọi và KHÔNG mở giao dịch.
//
// Khoá `lich_hen` THEO KHOÁ CHÍNH `lich_hen_id` (PLAN 5.3 tầng 6, quy tắc 7; AR-05): người gọi đã đọc thường `lich_hen_id` và `khung_gio_id`, đã khoá `khung_gio` (tầng 5). KHÔNG BAO GIỜ khoá
// theo `khung_gio_id`: deadlock 1213 với gỡ ca của `doctor` (HL-18, doctor M12).

/** Hàng `lich_hen` đọc DƯỚI khoá: nguồn của mọi quyết định (phạm vi, ma trận, số hoàn). */
export interface LockedAppointment {
  benhNhanId: string;
  chiNhanhId: string;
  trangThai: TrangThaiLichHen;
  /** `lich_hen.thoi_gian` (giờ Việt Nam, đọc bằng `DATE_FORMAT` nên không lệch múi giờ, H13) */
  thoiGian: Date;
  /** `chinh_sach_hoan_snapshot` đã parse (mảng hoặc `null`); kiểu `unknown`: `calculateRefund` kiểm cấu trúc (entity khai `Record<string, unknown>`, TECH_DEBT dòng 91) */
  chinhSachHoan: unknown;
}

interface RawLockedAppointment extends Omit<LockedAppointment, 'thoiGian'> {
  thoiGian: string;
}

const LOCK_SQL = `SELECT CAST(benh_nhan_id AS CHAR) AS benhNhanId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, trang_thai AS trangThai,
  DATE_FORMAT(thoi_gian, '%Y-%m-%d %H:%i:%s') AS thoiGian, chinh_sach_hoan_snapshot AS chinhSachHoan
FROM lich_hen WHERE lich_hen_id = ?
FOR UPDATE`;

// `trang_thai = ?` là trạng thái nguồn đọc dưới khoá: lưới an toàn thứ hai (đúng 1 hàng ⇒ đã huỷ). `thoi_diem_huy` chỉ nhận mốc đã `toSecond` (M4).
const CANCEL_SQL = `UPDATE lich_hen SET trang_thai = 'DaHuy', thoi_diem_huy = ?, ly_do_huy = ?
WHERE lich_hen_id = ? AND trang_thai = ?`;

/** `FOR UPDATE` theo khoá chính và đọc trạng thái MỚI NHẤT dưới khoá; `null` nếu không còn lịch đó. */
export async function lockAppointment(
  em: EntityManager,
  lichHenId: string,
): Promise<LockedAppointment | null> {
  const rows = await em.query<RawLockedAppointment[]>(LOCK_SQL, [lichHenId]);
  const row = rows[0];
  if (row === undefined) return null;
  return { ...row, thoiGian: parseVnDateTime(row.thoiGian) };
}

/** `DaHuy` với `thoi_diem_huy` = `now` và `ly_do_huy`, CHỈ khi lịch còn đúng `from`. `true` khi đúng 1 hàng bị ảnh hưởng. */
export async function markCancelled(
  em: EntityManager,
  input: { lichHenId: string; from: TrangThaiLichHen; now: Date; lyDo: string },
): Promise<boolean> {
  const result: { affectedRows?: number } = await em.query(CANCEL_SQL, [
    toSecond(input.now),
    input.lyDo,
    input.lichHenId,
    input.from,
  ]);
  return result.affectedRows === 1;
}
