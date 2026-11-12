import type { EntityManager } from 'typeorm';
import { CA_LAM_VIEC, type CaLamViec } from '../../admin/entities/enums.js';
import { toSecond } from '../../common/time/time.js';
import type { ActiveAppointmentState } from '../active-appointment-states.js';
import { dayBounds, isBigintId } from '../lists/list-query.rules.js';
import { EXAMINEE_NAME_SQL } from '../lists/list-query.sql.js';

// Lịch hẹn BỊ ẢNH HƯỞNG bởi nghỉ phép của bác sĩ (task B11; PLAN booking 5.10 D5 và D13; CG-08, CG-11…CG-15, CG-18; doctor M4, M10). CHỈ ĐỌC: không `FOR UPDATE`, không `FOR SHARE`, không ghi.
// MỘT định nghĩa "bị ảnh hưởng" (`affectedByLeaveClause`) cho CẢ `findAffectedByLeave` (D5: `doctor` huỷ từng lịch) và `listAffectedByLeave` (D13: hộp xác nhận), không hai bản SQL (CG-14).
//
// Điều kiện: lịch `ChoThanhToan` hoặc `DaXacNhan` của đúng bác sĩ, có `thoi_gian > now` và `thoi_gian` trong khoảng NỬA MỞ `[tuNgay 00:00, ngày kế của denNgay 00:00)` giờ Việt Nam, tuỳ `ca`
// (lấy từ `lich_lam_viec` của khung giờ, không suy từ giờ). Không bọc cột bằng `DATE()` (mất chỉ mục `lich_hen_index_10 (bac_si_id, thoi_gian)`, AR-05). Ngày của lịch lấy từ `thoi_gian` (sao
// chép từ `khung_gio.ngay_gio`, bằng `lich_lam_viec.ngay` vì bộ sinh khung giờ của `doctor` sinh trong ngày của ca); không đọc cột `lich_lam_viec.ngay` nên không cần `DATE_FORMAT` cho nó.
// `now` do người gọi truyền (đã hay chưa `toSecond` đều được: hàm tự cắt) và KHÔNG BAO GIỜ đọc đồng hồ máy: sweeper của `doctor` chạy lại phải ra cùng tập (CG-13, AR-04).

/** Tập trạng thái bị ảnh hưởng: CỐ Ý thiếu `DaTiepDon` so với `ACTIVE_APPOINTMENT_STATES` (lịch đã tiếp đón thì bệnh nhân đang ở phòng khám, không huỷ). */
export const LEAVE_AFFECTED_STATES = [
  'ChoThanhToan',
  'DaXacNhan',
] as const satisfies readonly ActiveAppointmentState[];

export type LeaveAffectedState = (typeof LEAVE_AFFECTED_STATES)[number];

export interface AffectedByLeaveFilter {
  /** `bac_si.tai_khoan_id` */
  bacSiId: string;
  /** Ngày đầu của khoảng nghỉ, `YYYY-MM-DD` (ngày có thật) */
  tuNgay: string;
  /** Ngày cuối (gồm cả ngày này), `YYYY-MM-DD` */
  denNgay: string;
  /** Nghỉ theo ca (`TheoCa`): chỉ lịch thuộc ca này; không có ⇒ cả ngày (`CaNgay`) */
  ca?: CaLamViec;
  /** Mốc của lượt: chỉ lấy lịch `thoi_gian > now` (lịch đã qua giờ và đúng giờ `now` KHÔNG bị lấy) */
  now: Date;
}

export interface AffectedAppointmentRef {
  lichHenId: string;
  maLichHen: string;
}

/** Một lịch trong hộp xác nhận (D13): DANH SÁCH TRẮNG, không SĐT, email, `ly_do_kham`, giá, `lich_hen_id`, `benh_nhan_id`. */
export interface AffectedLeaveItem {
  maLichHen: string;
  /** ISO 8601 UTC */
  thoiGian: string;
  trangThai: LeaveAffectedState;
  nguoiKham: { hoTen: string };
  /** Chuỗi decimal (H11) */
  tienCocSnapshot: string;
}

export interface AffectedLeaveSummary {
  /** Số lịch bị ảnh hưởng, KHÔNG phụ thuộc `limit` */
  tong: number;
  /** Số `benh_nhan_id` KHÁC NHAU (một tài khoản đặt cho mình và người thân tính một) */
  soBenhNhan: number;
  /** Số lịch có `tien_coc_snapshot > 0` */
  soCoCoc: number;
  items: AffectedLeaveItem[];
}

export interface AffectedByLeaveClause {
  /** Các JOIN thêm vào sau `FROM lich_hen lh` (rỗng khi không lọc `ca`) */
  joins: string;
  where: string;
  /** Giá trị cho các `?` của `where`, đúng thứ tự */
  params: unknown[];
}

// `ca` KHÔNG nằm ở `lich_hen`: là `lich_lam_viec.ca`, nối qua `khung_gio` (khoá ngoại NOT NULL, khoá chính ở phía kia nên không đổi số hàng)
const CA_JOINS = `INNER JOIN khung_gio kg ON kg.khung_gio_id = lh.khung_gio_id
INNER JOIN lich_lam_viec llv ON llv.lich_lam_viec_id = kg.lich_lam_viec_id`;

// Tên người khám: bản thân là họ tên tài khoản của người đặt, người thân là họ tên hồ sơ (biểu thức dùng chung `EXAMINEE_NAME_SQL`)
const EXAMINEE_JOINS = `INNER JOIN tai_khoan tbn ON tbn.tai_khoan_id = lh.benh_nhan_id
LEFT JOIN ho_so_nguoi_than hs ON hs.ho_so_nguoi_than_id = lh.ho_so_nguoi_than_id`;

/**
 * MỘT hàm lọc duy nhất của ba hàm đọc (D5, D13). Sai đầu vào (id, ngày không có thật, `ca` lạ, `now` hỏng) là lỗi LẬP TRÌNH của người gọi ⇒ `RangeError` trước khi chạm DB.
 * `tuNgay` sau `denNgay` không phải lỗi: khoảng rỗng nên không có lịch nào.
 */
export function affectedByLeaveClause(
  filter: AffectedByLeaveFilter,
): AffectedByLeaveClause {
  if (!isBigintId(filter.bacSiId))
    throw new RangeError('bacSiId không phải id hợp lệ');
  if (!(filter.now instanceof Date) || Number.isNaN(filter.now.getTime()))
    throw new RangeError('now không phải thời điểm hợp lệ');
  if (filter.ca !== undefined && !CA_LAM_VIEC.includes(filter.ca))
    throw new RangeError('ca không hợp lệ');
  if (typeof filter.tuNgay !== 'string' || typeof filter.denNgay !== 'string')
    throw new RangeError('tuNgay và denNgay phải là chuỗi YYYY-MM-DD');
  const { from, to } = dayBounds(filter.tuNgay, filter.denNgay); // ngày không có thật ⇒ RangeError

  const placeholders = LEAVE_AFFECTED_STATES.map(() => '?').join(', ');
  const conditions = [
    'lh.bac_si_id = ?',
    `lh.trang_thai IN (${placeholders})`,
    'lh.thoi_gian > ?',
  ];
  const params: unknown[] = [
    filter.bacSiId,
    ...LEAVE_AFFECTED_STATES,
    toSecond(filter.now),
  ];
  // `to` chỉ NULL khi `denNgay` là ngày cuối cùng MySQL biểu diễn được: không chặn trên
  if (from !== null) {
    conditions.push('lh.thoi_gian >= ?');
    params.push(from);
  }
  if (to !== null) {
    conditions.push('lh.thoi_gian < ?');
    params.push(to);
  }
  let joins = '';
  if (filter.ca !== undefined) {
    joins = CA_JOINS;
    conditions.push('llv.ca = ?');
    params.push(filter.ca);
  }
  return { joins, where: conditions.join(' AND '), params };
}

/** D5: các lịch bị ảnh hưởng, sắp `thoi_gian` tăng rồi `lich_hen_id`; không giới hạn số dòng. `doctor` huỷ từng lịch bằng `AppointmentCancellationService.cancel`. */
export async function findAffectedByLeave(
  em: EntityManager,
  filter: AffectedByLeaveFilter,
): Promise<AffectedAppointmentRef[]> {
  const { joins, where, params } = affectedByLeaveClause(filter);
  const rows = await em.query<AffectedAppointmentRef[]>(
    `SELECT CAST(lh.lich_hen_id AS CHAR) AS lichHenId, lh.ma_lich_hen AS maLichHen
FROM lich_hen lh ${joins}
WHERE ${where}
ORDER BY lh.thoi_gian, lh.lich_hen_id`,
    params,
  );
  // Chỉ hai khoá, đúng chữ ký (không trải hàng thô của driver)
  return rows.map((row) => ({
    lichHenId: row.lichHenId,
    maLichHen: row.maLichHen,
  }));
}

interface TotalsRow {
  tong: number | string;
  soBenhNhan: number | string;
  soCoCoc: number | string | null;
}

interface PageRow {
  maLichHen: string;
  thoiGian: Date;
  trangThai: LeaveAffectedState;
  nguoiKham: string;
  tienCocSnapshot: string;
}

/**
 * D13: số liệu và `limit` dòng đầu cho hộp xác nhận, CÙNG bộ lọc với `findAffectedByLeave` (`affectedByLeaveClause`). Hai câu (số đếm, rồi trang): người gọi truyền `em` của `runReadOnly` nếu
 * muốn cùng một ảnh chụp. `limit` là số nguyên không âm; `0` hay không có lịch nào thì bỏ câu trang. Danh sách trắng ở `PageRow` và phép ánh xạ bên dưới.
 */
export async function listAffectedByLeave(
  em: EntityManager,
  input: AffectedByLeaveFilter & { limit: number },
): Promise<AffectedLeaveSummary> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 0)
    throw new RangeError('limit phải là số nguyên không âm');
  const { joins, where, params } = affectedByLeaveClause(input);

  const totals = await em.query<TotalsRow[]>(
    `SELECT COUNT(*) AS tong, COUNT(DISTINCT lh.benh_nhan_id) AS soBenhNhan, SUM(lh.tien_coc_snapshot > 0) AS soCoCoc
FROM lich_hen lh ${joins}
WHERE ${where}`,
    params,
  );
  const row = totals[0];
  const tong = Number(row?.tong ?? 0);
  const summary: AffectedLeaveSummary = {
    tong,
    soBenhNhan: Number(row?.soBenhNhan ?? 0),
    // `SUM` của tập rỗng là NULL
    soCoCoc: Number(row?.soCoCoc ?? 0),
    items: [],
  };
  if (tong === 0 || input.limit === 0) return summary;

  const page = await em.query<PageRow[]>(
    `SELECT lh.ma_lich_hen AS maLichHen, lh.thoi_gian AS thoiGian, lh.trang_thai AS trangThai,
  ${EXAMINEE_NAME_SQL} AS nguoiKham, CAST(lh.tien_coc_snapshot AS CHAR) AS tienCocSnapshot
FROM lich_hen lh ${joins}
${EXAMINEE_JOINS}
WHERE ${where}
ORDER BY lh.thoi_gian, lh.lich_hen_id
LIMIT ?`,
    [...params, input.limit],
  );
  summary.items = page.map((item) => ({
    maLichHen: item.maLichHen,
    thoiGian: item.thoiGian.toISOString(),
    trangThai: item.trangThai,
    nguoiKham: { hoTen: item.nguoiKham },
    tienCocSnapshot: item.tienCocSnapshot,
  }));
  return summary;
}
