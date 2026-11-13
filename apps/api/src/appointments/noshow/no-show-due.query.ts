import type { EntityManager } from 'typeorm';

// Mệnh đề "CA ĐÃ KẾT THÚC" của job tự Vắng mặt (task B13; PLAN booking 5.7, Q23, VM-01…VM-04, VM-11; số đo X1 M6, TRACKING 3.9.4; kế hoạch TRACKING 3.29 B13-D). MỘT hằng, DÙNG CHUNG cho hai câu:
//  - `findNoShowCandidates`: DANH SÁCH ứng viên của job (đọc thường, theo lô);
//  - `isNoShowDue`: kiểm LẠI dưới khoá lịch (`markNoShow` với `actor: 'HeThong'` gọi qua `isDue`), đọc thường theo khoá chính.
// Hai câu chỉ khác phần ngoài mệnh đề (chọn cột, cận con trỏ, `LIMIT` / tra theo `lich_hen_id`), nên KHÔNG thể lệch nhau về "thế nào là đã đến hạn" (NSQ-01 khoá điều đó, NSQ-02 kiểm bằng dữ liệu thật).
//
// Lịch `DaXacNhan` ⋈ `khung_gio` ⋈ `lich_lam_viec` ⋈ `chi_nhanh_lich_hoat_dong`: giờ kết thúc ca là `gio_ket_thuc_sang` (`CaSang`) hoặc `gio_ket_thuc_chieu` (`CaChieu`) của chi nhánh CỦA CA
// (`lich_lam_viec.chi_nhanh_id`: chi nhánh lúc phân công, giữ nguyên khi bác sĩ đổi chi nhánh; KHÔNG phải `lich_hen.chi_nhanh_id`) vào thứ của ngày làm việc (`WEEKDAY(ngay) + 1` khớp thứ ISO của bảng).
// `TIMESTAMP(ngày, giờ kết thúc) <= :now` NỬA MỞ: đúng giờ kết thúc là đã kết thúc (VM-02). `:now` luôn TRUYỀN VÀO (`toSecond(nowVN())` của người gọi), KHÔNG `NOW()` (AR-04, H8).
// Ca không có khoảng (`CaToi`, buổi không có khoảng, chi nhánh nghỉ thứ đó): `CASE` ra NULL, `TIMESTAMP(ngày, NULL)` là NULL, `NULL <= ?` không thoả WHERE nên KHÔNG tự đánh (VM-11, quy tắc 44).
// Cắt sớm `lh.thoi_gian <= :now` (X1 M6: một lô rẻ hơn khoảng 25%) còn là luật nghiệp vụ: không bao giờ đánh Vắng mặt TRƯỚC giờ hẹn của chính lịch đó, kể cả khi chi nhánh thu hẹp giờ làm sau khi khung giờ đã sinh (NSQ-03).

/** Giờ kết thúc của ca của lịch theo lịch hoạt động của chi nhánh; `CaToi` (và ca không có khoảng) ra NULL. */
export const SHIFT_END_SQL = `CASE llv.ca WHEN 'CaSang' THEN cn.gio_ket_thuc_sang WHEN 'CaChieu' THEN cn.gio_ket_thuc_chieu END`;

// Hai đầu nối từ lịch tới ca, và đầu nối ca tới lịch hoạt động của chi nhánh vào đúng thứ (dùng lại ở câu đếm với LEFT JOIN)
const SHIFT_JOINS_SQL = `JOIN khung_gio kg ON kg.khung_gio_id = lh.khung_gio_id
JOIN lich_lam_viec llv ON llv.lich_lam_viec_id = kg.lich_lam_viec_id`;
const BRANCH_HOURS_ON_SQL = `cn.chi_nhanh_id = llv.chi_nhanh_id AND cn.thu_trong_tuan = WEEKDAY(llv.ngay) + 1`;
// Lịch còn `DaXacNhan` mà giờ hẹn đã qua (một dấu `?`: `now`)
const CONFIRMED_AND_PAST_SQL = `lh.trang_thai = 'DaXacNhan' AND lh.thoi_gian <= ?`;

/** Phần FROM dùng chung của câu ứng viên và câu kiểm lại. */
export const DUE_FROM_SQL = `FROM lich_hen lh
${SHIFT_JOINS_SQL}
JOIN chi_nhanh_lich_hoat_dong cn ON ${BRANCH_HOURS_ON_SQL}`;

/** Điều kiện "đến hạn tự Vắng mặt" dùng chung: HAI dấu `?`, cả hai là `now` (xem `dueParams`). */
export const DUE_WHERE_SQL = `${CONFIRMED_AND_PAST_SQL}
AND TIMESTAMP(llv.ngay, ${SHIFT_END_SQL}) <= ?`;

/** Tham số của `DUE_WHERE_SQL`: cùng một mốc cho cắt sớm và cho giờ kết thúc ca. */
export const dueParams = (now: Date): [Date, Date] => [now, now];

export interface NoShowCandidateInput {
  /** Mốc của lượt, đã `toSecond(nowVN())` */
  now: Date;
  /** `lich_hen_id` cuối của lô trước (hoặc `null` cho lô đầu) */
  afterId: string | null;
  limit: number;
}

/**
 * Một lô tối đa `limit` id lịch đến hạn, theo `lich_hen_id` tăng dần, bắt đầu SAU `afterId`. CHỈ ĐỌC. Sắp theo khoá chính (không phải theo giờ) vì optimizer quét khoá chính của `lich_hen` (X1 M6, TECH_DEBT dòng 90):
 * con trỏ `lich_hen_id > ?` là cận quét THẬT, và lịch lỗi nằm TRƯỚC con trỏ nên không chặn các lịch sau trong cùng lượt. Id là chuỗi số (bigint) để không mất chính xác.
 */
export async function findNoShowCandidates(
  em: EntityManager,
  input: NoShowCandidateInput,
): Promise<string[]> {
  const params: unknown[] = [...dueParams(input.now)];
  let sql = `SELECT CAST(lh.lich_hen_id AS CHAR) AS lichHenId
${DUE_FROM_SQL}
WHERE ${DUE_WHERE_SQL}`;
  if (input.afterId !== null) {
    sql += ' AND lh.lich_hen_id > ?';
    params.push(input.afterId);
  }
  sql += ' ORDER BY lh.lich_hen_id LIMIT ?';
  params.push(input.limit);
  const rows = await em.query<{ lichHenId: string }[]>(sql, params);
  return rows.map((row) => row.lichHenId);
}

/**
 * Lịch `lichHenId` có còn ĐẾN HẠN ở mốc `now` không. Người gọi (`markNoShow`) đã khoá lịch; đây là đọc THƯỜNG các bảng ca và lịch hoạt động (không xin khoá nào trên `khung_gio`, `lich_lam_viec`,
 * `chi_nhanh_lich_hoat_dong`), tra theo khoá chính của lịch.
 */
export async function isNoShowDue(
  em: EntityManager,
  lichHenId: string,
  now: Date,
): Promise<boolean> {
  const rows = await em.query<unknown[]>(
    `SELECT 1 AS due
${DUE_FROM_SQL}
WHERE lh.lich_hen_id = ? AND ${DUE_WHERE_SQL}
LIMIT 1`,
    [lichHenId, ...dueParams(now)],
  );
  return rows.length > 0;
}

// Lịch `DaXacNhan` đã QUÁ giờ hẹn mà không có giờ kết thúc ca: job không tự đánh được, chờ Lễ tân hay Quản trị viên (VM-11). LEFT JOIN ở lịch hoạt động để gồm cả chi nhánh thiếu dòng của thứ đó
// (câu ứng viên dùng JOIN nên loại im lặng các lịch này). Chỉ lịch đã quá giờ hẹn: lịch tương lai không phải việc cần chú ý (M6 đếm cả tương lai: 1.900).
const UNATTENDED_SQL = `SELECT COUNT(*) AS n
FROM lich_hen lh
${SHIFT_JOINS_SQL}
LEFT JOIN chi_nhanh_lich_hoat_dong cn ON ${BRANCH_HOURS_ON_SQL}
WHERE ${CONFIRMED_AND_PAST_SQL} AND ${SHIFT_END_SQL} IS NULL`;

/** Số lịch `DaXacNhan` đã quá giờ hẹn mà ca không có giờ kết thúc (một con số cho cả lượt, không liệt kê từng lịch). */
export async function countUnattended(
  em: EntityManager,
  now: Date,
): Promise<number> {
  const rows = await em.query<{ n: number | string }[]>(UNATTENDED_SQL, [now]);
  return Number(rows[0]?.n ?? 0);
}
