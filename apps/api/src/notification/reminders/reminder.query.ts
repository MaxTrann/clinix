import type { EntityManager } from 'typeorm';
import { isDuplicateKeyError } from '../../database/mysql-errors.js';
import {
  REMINDER_LATE_WINDOW_MINUTES,
  REMINDER_MAX_ATTEMPTS,
  REMINDER_RETRY_GAP_MINUTES,
} from './reminder.constants.js';

// NƠI DUY NHẤT ghi `nhac_lich_hen` (notification B3; PLAN 5.6; HTB-06). Mọi câu chạy TỰ XÁC NHẬN (autocommit qua `db.manager`), mỗi câu một hàng theo khoá chính:
// không giao dịch dài, không khoá nào giữ qua lúc gọi SMTP (nếp `email-outbox.query.ts` của booking B15).
// Hai tiến trình cùng chạy không gửi trùng nhờ (1) khoá chính `(lich_hen_id, so_gio_truoc)` khi tạo dòng và (2) câu NHẬN VIỆC có điều kiện `so_lan_thu = <giá trị đã đọc>`.
//
// Vì sao `INSERT` thường + bắt 1062 mà không `INSERT … ON DUPLICATE KEY UPDATE` như quy tắc 41: X1 đo M4 thấy `mysql2` bật cờ CLIENT_FOUND_ROWS nên lần chèn trùng vẫn trả
// `affectedRows` = 1, không phân biệt được "vừa tạo" (TRACKING notification mục 6).
// CHECK `chk_nhac_lich_hen_ket_qua`: `DaGui` cần `da_gui_luc` và `so_lan_thu` ≥ 1; `ThatBai` cần `loi_cuoi`, `da_gui_luc` NULL và `so_lan_thu` ≥ 1. Câu nhận việc tăng `so_lan_thu`
// TRƯỚC khi gửi nên cả hai kết quả đều thoả `so_lan_thu` ≥ 1.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Khoảng `thoi_gian` của lịch có mốc `soGio` giờ đến hạn ở `now`: mốc `thoi_gian − soGio giờ` nằm trong `[now − 10 phút, now]` (đóng hai đầu). */
export function dueWindow(now: Date, soGio: number): { from: Date; to: Date } {
  const to = new Date(now.getTime() + soGio * HOUR_MS);
  return {
    from: new Date(to.getTime() - REMINDER_LATE_WINDOW_MINUTES * MINUTE_MS),
    to,
  };
}

/**
 * Lịch có mốc `soGio` MỚI đến hạn: `DaXacNhan`, chưa tới giờ hẹn, giờ hẹn trong `dueWindow`, CHƯA có dòng `(lich_hen_id, soGio)`. Khác `JSON_TABLE` của câu mẫu cuối `clinix_mysql.sql`:
 * một câu cho mỗi mốc, dạng khoảng hẹp trên `thoi_gian` (PLAN 5.6 bước 2; X1 M3 đo 41 đến 43 ms ở 100.000 lịch). Không cần con trỏ: lịch đã xử lý có dòng nên câu sau không thấy nữa.
 */
export const SELECT_NEW_DUE_SQL = `SELECT CAST(l.lich_hen_id AS CHAR) AS lichHenId
  FROM lich_hen l
  LEFT JOIN nhac_lich_hen n ON n.lich_hen_id = l.lich_hen_id AND n.so_gio_truoc = ?
 WHERE l.trang_thai = 'DaXacNhan'
   AND l.thoi_gian > ?
   AND l.thoi_gian BETWEEN ? AND ?
   AND n.lich_hen_id IS NULL
 ORDER BY l.thoi_gian, l.lich_hen_id
 LIMIT ?`;

export async function selectNewDue(
  em: EntityManager,
  input: { now: Date; soGio: number; limit: number },
): Promise<string[]> {
  const { from, to } = dueWindow(input.now, input.soGio);
  const rows: { lichHenId: string }[] = await em.query(SELECT_NEW_DUE_SQL, [
    input.soGio,
    input.now,
    from,
    to,
    input.limit,
  ]);
  return rows.map((row) => row.lichHenId);
}

export const INSERT_REMINDER_SQL =
  'INSERT INTO nhac_lich_hen (lich_hen_id, so_gio_truoc, thoi_diem_tao) VALUES (?, ?, ?)';

/** Tạo dòng `ChoGui` của mốc. `false` = dòng đã có (1062 trên khoá chính: bên khác vừa tạo); lỗi khác nổi lên. */
export async function insertReminder(
  em: EntityManager,
  lichHenId: string,
  soGio: number,
  now: Date,
): Promise<boolean> {
  try {
    await em.query(INSERT_REMINDER_SQL, [lichHenId, soGio, now]);
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

/** Một dòng nhắc ĐỌC trước khi nhận việc: giá trị cũ dùng làm điều kiện nhận việc và để trả lại khi chưa cấu hình SMTP. */
export interface DueReminder {
  lichHenId: string;
  soGioTruoc: number;
  trangThai: 'ChoGui' | 'ThatBai';
  soLanThu: number;
  /** 'YYYY-MM-DD HH:mm:ss' (giờ Việt Nam như đã lưu) hoặc null */
  lanThuCuoiLuc: string | null;
  loiCuoi: string | null;
}

/** Dòng vừa tạo ở bước "mốc mới": đúng giá trị mặc định của bảng. */
export const freshReminder = (
  lichHenId: string,
  soGioTruoc: number,
): DueReminder => ({
  lichHenId,
  soGioTruoc,
  trangThai: 'ChoGui',
  soLanThu: 0,
  lanThuCuoiLuc: null,
  loiCuoi: null,
});

/**
 * Dòng đang chờ hay cần thử lại (PLAN 5.6 bước 3): `ChoGui` hoặc `ThatBai`, chưa hết `REMINDER_MAX_ATTEMPTS` lần, chưa thử hoặc lần cuối đã quá `REMINDER_RETRY_GAP_MINUTES`; và `ChoGui` (luôn chọn để
 * ĐÓNG dòng mồ côi khi lịch đã hết hiệu lực) HOẶC lịch còn `DaXacNhan` và chưa tới giờ hẹn (`ThatBai` chỉ thử lại khi lịch còn hiệu lực, 2.4.69 A1 3b). Không phụ thuộc cấu hình hiện hành.
 * Con trỏ theo khoá chính để một lượt không lặp lại hàng.
 */
export const SELECT_RETRY_DUE_SQL = `SELECT CAST(n.lich_hen_id AS CHAR) AS lichHenId, n.so_gio_truoc AS soGioTruoc, n.trang_thai AS trangThai, n.so_lan_thu AS soLanThu,
       DATE_FORMAT(n.lan_thu_cuoi_luc, '%Y-%m-%d %H:%i:%s') AS lanThuCuoiLuc, n.loi_cuoi AS loiCuoi
  FROM nhac_lich_hen n
  JOIN lich_hen l ON l.lich_hen_id = n.lich_hen_id
 WHERE n.trang_thai IN ('ChoGui', 'ThatBai')
   AND n.so_lan_thu < ?
   AND (n.lan_thu_cuoi_luc IS NULL OR n.lan_thu_cuoi_luc <= ?)
   AND (n.trang_thai = 'ChoGui' OR (l.trang_thai = 'DaXacNhan' AND l.thoi_gian > ?))
   AND (n.lich_hen_id > ? OR (n.lich_hen_id = ? AND n.so_gio_truoc > ?))
 ORDER BY n.lich_hen_id, n.so_gio_truoc
 LIMIT ?`;

export interface ReminderCursor {
  lichHenId: string;
  soGioTruoc: number;
}

export const START_CURSOR: ReminderCursor = { lichHenId: '0', soGioTruoc: 0 };

export async function selectRetryDue(
  em: EntityManager,
  input: { now: Date; after: ReminderCursor; limit: number },
): Promise<DueReminder[]> {
  const retryBefore = new Date(
    input.now.getTime() - REMINDER_RETRY_GAP_MINUTES * MINUTE_MS,
  );
  const rows: (Omit<DueReminder, 'soLanThu' | 'soGioTruoc'> & {
    soLanThu: number | string;
    soGioTruoc: number | string;
  })[] = await em.query(SELECT_RETRY_DUE_SQL, [
    REMINDER_MAX_ATTEMPTS,
    retryBefore,
    input.now,
    input.after.lichHenId,
    input.after.lichHenId,
    input.after.soGioTruoc,
    input.limit,
  ]);
  return rows.map((row) => ({
    ...row,
    soGioTruoc: Number(row.soGioTruoc),
    soLanThu: Number(row.soLanThu),
  }));
}

const AFFECTED_ONE = (result: { affectedRows?: number }): boolean =>
  result.affectedRows === 1;

/** NHẬN VIỆC: tăng `so_lan_thu` và ghi `lan_thu_cuoi_luc` nếu hàng vẫn đúng như đã đọc. `true` = bên này thắng; `false` = bên khác đã nhận trước (không gửi). */
export const CLAIM_REMINDER_SQL = `UPDATE nhac_lich_hen SET so_lan_thu = so_lan_thu + 1, lan_thu_cuoi_luc = ?
 WHERE lich_hen_id = ? AND so_gio_truoc = ? AND trang_thai IN ('ChoGui', 'ThatBai') AND so_lan_thu = ?`;

export async function claimReminder(
  em: EntityManager,
  reminder: DueReminder,
  now: Date,
): Promise<boolean> {
  return AFFECTED_ONE(
    await em.query(CLAIM_REMINDER_SQL, [
      now,
      reminder.lichHenId,
      reminder.soGioTruoc,
      reminder.soLanThu,
    ]),
  );
}

/** Kiểm lại lịch NGAY TRƯỚC khi gửi (PLAN 5.6 bước 4c): còn `DaXacNhan` và chưa tới giờ hẹn. Đọc thường, không khoá. */
export const APPOINTMENT_STILL_DUE_SQL = `SELECT 1 AS ok FROM lich_hen
 WHERE lich_hen_id = ? AND trang_thai = 'DaXacNhan' AND thoi_gian > ?`;

export async function isAppointmentStillDue(
  em: EntityManager,
  lichHenId: string,
  now: Date,
): Promise<boolean> {
  const rows: unknown[] = await em.query(APPOINTMENT_STILL_DUE_SQL, [
    lichHenId,
    now,
  ]);
  return rows.length > 0;
}

// Ba câu kết quả chỉ ghi khi hàng vẫn ở đúng lần nhận việc CỦA MÌNH (`so_lan_thu` = số đã đọc + 1): mình chậm quá nhịp và bên khác đã nhận lại thì kết quả của mình bị bỏ, không đè
export const MARK_SENT_SQL = `UPDATE nhac_lich_hen SET trang_thai = 'DaGui', da_gui_luc = ?, loi_cuoi = NULL
 WHERE lich_hen_id = ? AND so_gio_truoc = ? AND trang_thai IN ('ChoGui', 'ThatBai') AND so_lan_thu = ?`;
export const MARK_FAILED_SQL = `UPDATE nhac_lich_hen SET trang_thai = 'ThatBai', da_gui_luc = NULL, loi_cuoi = ?
 WHERE lich_hen_id = ? AND so_gio_truoc = ? AND trang_thai IN ('ChoGui', 'ThatBai') AND so_lan_thu = ?`;
export const RELEASE_CLAIM_SQL = `UPDATE nhac_lich_hen SET so_lan_thu = ?, lan_thu_cuoi_luc = ?, trang_thai = ?, loi_cuoi = ?
 WHERE lich_hen_id = ? AND so_gio_truoc = ? AND so_lan_thu = ?`;

export async function markSent(
  em: EntityManager,
  reminder: DueReminder,
  at: Date,
): Promise<boolean> {
  return AFFECTED_ONE(
    await em.query(MARK_SENT_SQL, [
      at,
      reminder.lichHenId,
      reminder.soGioTruoc,
      reminder.soLanThu + 1,
    ]),
  );
}

/** `loiCuoi` là chữ CỐ ĐỊNH (loại lỗi), không bao giờ có địa chỉ hay chữ của máy chủ SMTP (BTB-07); cột `varchar(500)`. */
export async function markFailed(
  em: EntityManager,
  reminder: DueReminder,
  loiCuoi: string,
): Promise<boolean> {
  return AFFECTED_ONE(
    await em.query(MARK_FAILED_SQL, [
      loiCuoi.slice(0, 500),
      reminder.lichHenId,
      reminder.soGioTruoc,
      reminder.soLanThu + 1,
    ]),
  );
}

/** Trả hàng về đúng giá trị TRƯỚC khi nhận việc (chưa cấu hình SMTP không được tính là một lần thử; NLH-14). */
export async function releaseClaim(
  em: EntityManager,
  reminder: DueReminder,
): Promise<boolean> {
  return AFFECTED_ONE(
    await em.query(RELEASE_CLAIM_SQL, [
      reminder.soLanThu,
      reminder.lanThuCuoiLuc,
      reminder.trangThai,
      reminder.loiCuoi,
      reminder.lichHenId,
      reminder.soGioTruoc,
      reminder.soLanThu + 1,
    ]),
  );
}
