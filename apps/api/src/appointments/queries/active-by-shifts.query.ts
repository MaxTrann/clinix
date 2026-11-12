import type { EntityManager } from 'typeorm';
import { ACTIVE_APPOINTMENT_STATES } from '../active-appointment-states.js';
import { isBigintId } from '../lists/list-query.rules.js';

// Đếm lịch hẹn ĐANG CÓ theo ca (task B11; PLAN booking 5.10 D14; CG-16, CG-17): lưới lịch của `doctor` (`soLichHenDangCo`). CHỈ ĐỌC, MỘT câu `GROUP BY` bất kể số ca (không N+1).
// "Đang có" là đúng `ACTIVE_APPOINTMENT_STATES` (`ChoThanhToan`, `DaXacNhan`, `DaTiepDon`), lấy thẳng từ hằng, không viết lại tập. Khoá của kết quả là `lichLamViecId`.

// `khung_gio` đi theo chỉ mục `(lich_lam_viec_id, ngay_gio)`, `lich_hen` nối bằng chỉ mục khoá ngoại `khung_gio_id`; đếm theo ca của KHUNG GIỜ (lịch huỷ vẫn giữ `khung_gio_id` nhưng không thuộc tập trạng thái)
const countSql = (
  shiftCount: number,
): string => `SELECT CAST(kg.lich_lam_viec_id AS CHAR) AS lichLamViecId, COUNT(*) AS soLich
FROM khung_gio kg
INNER JOIN lich_hen lh ON lh.khung_gio_id = kg.khung_gio_id
WHERE kg.lich_lam_viec_id IN (${Array.from({ length: shiftCount }, () => '?').join(', ')})
  AND lh.trang_thai IN (${ACTIVE_APPOINTMENT_STATES.map(() => '?').join(', ')})
GROUP BY kg.lich_lam_viec_id`;

interface CountRow {
  lichLamViecId: string;
  soLich: number | string;
}

/**
 * D14: số lịch đang có của từng ca. MỌI id được hỏi đều có khoá trong kết quả (không có lịch ⇒ `0`); danh sách rỗng ⇒ `{}` và không chạy SQL. Id phải là id BIGINT dạng chuỗi (lỗi lập trình ⇒ `RangeError`);
 * id trùng gộp một.
 */
export async function countActiveByShifts(
  em: EntityManager,
  input: { lichLamViecIds: string[] },
): Promise<Record<string, number>> {
  const ids = [...new Set(input.lichLamViecIds)];
  for (const id of ids)
    if (!isBigintId(id))
      throw new RangeError('lichLamViecId không phải id hợp lệ');
  if (ids.length === 0) return {};

  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = 0;
  const rows = await em.query<CountRow[]>(countSql(ids.length), [
    ...ids,
    ...ACTIVE_APPOINTMENT_STATES,
  ]);
  for (const row of rows) counts[row.lichLamViecId] = Number(row.soLich);
  return counts;
}
