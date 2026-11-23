import type { PendingEffectiveChange } from '../../admin/branch-change-requests/pending-branch-changes.reader.js';
import type { CaLamViec } from '../../admin/entities/enums.js';
import { weekdayVN } from '../../common/time/time.js';
import type {
  BranchDayHours,
  ShiftRange,
} from '../../scheduling/branch-hours/branch-hours.types.js';
import { checkSlotWithinBranchHours } from '../../scheduling/branch-hours/slot-hours.rules.js';

// Luật "khung giờ rơi vào vùng bị loại bởi thay đổi chi nhánh đã duyệt chưa áp dụng" (PLAN booking 5.10 B; admin Q6, Q48; TRACKING booking 3.50.1). HÀM THUẦN: không đọc DB,
// không đọc đồng hồ. Khớp từng điều kiện của admin B8 (`BranchImpactService`: `thoi_gian >= hieu_luc_tu`, thứ có dòng mới, khung KHÔNG nằm trọn trong khoảng mới của ĐÚNG ca,
// dịch vụ bị bỏ), nên booking chặn đúng những khung giờ mà lúc áp dụng admin sẽ tính là "ảnh hưởng".

export interface SlotQuery {
  ngayGio: Date;
  thoiLuongPhut: number;
  dichVuKhamId: string;
  ca: CaLamViec;
}

type ScheduleRow = PendingEffectiveChange['lichHoatDong'][number];

/** 'HH:mm:ss' (hoặc 'HH:mm') thành số giây từ 00:00; chuỗi sai dạng hoặc `null` thành `null` (khoảng coi như không có, giống `CAST(? AS TIME)` NULL của admin). */
function secondsOf(time: string | null): number | null {
  if (time === null) return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (match === null) return null;
  return (
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0)
  );
}

// Khoảng chỉ có khi CẢ HAI đầu có giờ (admin: khoảng NULL làm cả vế thành NULL, tức "không nằm trọn" ⇒ ảnh hưởng)
function rangeOf(start: string | null, end: string | null): ShiftRange | null {
  const tuGiay = secondsOf(start);
  const denGiay = secondsOf(end);
  return tuGiay === null || denGiay === null ? null : { tuGiay, denGiay };
}

// `hoat_dong` khác `true` (kể cả `null` của JSON hỏng) tính là ĐÓNG, như `active = day.hoatDong === true ? 1 : 0` của admin
function dayHoursOf(row: ScheduleRow): BranchDayHours {
  return {
    hoatDong: row.hoatDong === true,
    sang: rangeOf(row.gioBatDauSang, row.gioKetThucSang),
    chieu: rangeOf(row.gioBatDauChieu, row.gioKetThucChieu),
  };
}

function isExcluded(change: PendingEffectiveChange, slot: SlotQuery): boolean {
  // Trước `hieu_luc_tu` vẫn theo lịch cũ; đúng mốc là đã thuộc lịch mới (`>=` như `lh.thoi_gian >= ?` của admin)
  if (slot.ngayGio.getTime() < change.hieuLucTu.getTime()) return false;
  if (change.dichVuBoIds.includes(slot.dichVuKhamId)) return true;
  const thuTrongTuan = weekdayVN(slot.ngayGio);
  const row = change.lichHoatDong.find(
    (day) => day.thuTrongTuan === thuTrongTuan,
  );
  // Thứ không có dòng mới giữ nguyên lịch đang áp dụng
  if (row === undefined) return false;
  // Một định nghĩa "nằm trọn khoảng của ca" cho cả bước 5 (A6) và bước 7 (D2): hàm thuần của `scheduling/`
  return !checkSlotWithinBranchHours({
    ngayGio: slot.ngayGio,
    thoiLuongPhut: slot.thoiLuongPhut,
    ca: slot.ca,
    ngayHoatDong: dayHoursOf(row),
  }).ok;
}

/**
 * Yêu cầu ĐẦU TIÊN (theo thứ tự của danh sách: `hieu_luc_tu`, rồi id) loại khung giờ này; `null` nếu không yêu cầu nào loại.
 * `quaHan` KHÔNG làm đổi kết quả: yêu cầu quá hạn vẫn chặn (admin Q48, CN-108).
 */
export function findBlockingChange(
  changes: readonly PendingEffectiveChange[],
  slot: SlotQuery,
): PendingEffectiveChange | null {
  return changes.find((change) => isExcluded(change, slot)) ?? null;
}
