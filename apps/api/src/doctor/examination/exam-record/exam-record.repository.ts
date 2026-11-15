import type { EntityManager } from 'typeorm';
import type { ExamRecordFields, ValidExamRecord } from './exam-record.rules.js';

// Câu SQL của ghi và sửa hồ sơ khám (doctor-exam B2; PLAN 5.3, 5.5). Mọi hàm nhận `em` của GIAO DỊCH của người gọi (`withBookingTransaction`), không tự mở giao dịch. Thứ tự gọi (HSK-21): khoá `lich_hen` theo khoá chính
// (tầng 6) TRƯỚC khoá `ho_so_kham` theo `lich_hen_id` (tầng 6b) TRƯỚC mọi `INSERT`/`UPDATE` (H1). Cột `DATE` đọc bằng `DATE_FORMAT` (booking M4; X1 M11); `cap_nhat_lan_cuoi` ghi bằng tham số `Date` đã `toSecond`, KHÔNG `NOW()` (HD-08).
// `CAST … AS CHAR`: id là `bigint`, driver có thể trả số; luôn lấy chuỗi.

type Queryable = Pick<EntityManager, 'query'>;

export interface LockedAppointment {
  bacSiId: string;
  trangThai: string;
  /** Chi nhánh của LỊCH (đưa vào nhật ký để Quản trị viên chi nhánh lọc) */
  chiNhanhId: string;
  /** `DATE(thoi_gian)` giờ VN, `YYYY-MM-DD` */
  ngayKham: string;
}

export interface StoredRecord extends ExamRecordFields {
  hoSoKhamId: string;
  capNhatLanCuoi: Date;
}

// Khoá `lich_hen` CHỈ theo khoá chính (quy tắc 7 của lock-order; AR-05 chỉ quét `appointments/`, HD-08 không cấm)
export const LOCK_APPOINTMENT_SQL = `SELECT CAST(bac_si_id AS CHAR) AS bacSiId, trang_thai AS trangThai, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId,
       DATE_FORMAT(thoi_gian, '%Y-%m-%d') AS ngayKham
FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE`;

const RECORD_COLUMNS = `CAST(ho_so_kham_id AS CHAR) AS hoSoKhamId, trieu_chung AS trieuChung, chan_doan_so_bo AS chanDoanSoBo, huong_xu_ly AS huongXuLy,
       DATE_FORMAT(ngay_tai_kham_du_kien, '%Y-%m-%d') AS ngayTaiKhamDuKien, cap_nhat_lan_cuoi AS capNhatLanCuoi`;
// `lich_hen_id` UNIQUE ⇒ truy cập `const`; khi CHƯA có dòng, ở READ COMMITTED câu này không khoá gì (X1 M2), nên hai `INSERT` đầu tiên chỉ tuần tự hoá nhờ khoá `lich_hen`
export const LOCK_RECORD_SQL = `SELECT ${RECORD_COLUMNS}
FROM ho_so_kham WHERE lich_hen_id = ? FOR UPDATE`;
export const READ_RECORD_SQL = `SELECT ${RECORD_COLUMNS}
FROM ho_so_kham WHERE lich_hen_id = ?`;
export const INSERT_RECORD_SQL = `INSERT INTO ho_so_kham (lich_hen_id, trieu_chung, chan_doan_so_bo, huong_xu_ly, ngay_tai_kham_du_kien, cap_nhat_lan_cuoi)
VALUES (?, ?, ?, ?, ?, ?)`;
export const UPDATE_RECORD_SQL = `UPDATE ho_so_kham SET trieu_chung = ?, chan_doan_so_bo = ?, huong_xu_ly = ?, ngay_tai_kham_du_kien = ?, cap_nhat_lan_cuoi = ?
WHERE ho_so_kham_id = ?`;

/** Khoá lịch theo khoá chính và đọc thứ cần kiểm LẠI dưới khoá; `null` nếu không còn dòng. */
export async function lockAppointment(
  em: Queryable,
  lichHenId: string,
): Promise<LockedAppointment | null> {
  const rows = await em.query<LockedAppointment[]>(LOCK_APPOINTMENT_SQL, [
    lichHenId,
  ]);
  return rows[0] ?? null;
}

/** Khoá dòng hồ sơ của lịch (đã giữ khoá `lich_hen`); `null` nếu chưa có. */
export async function lockRecord(
  em: Queryable,
  lichHenId: string,
): Promise<StoredRecord | null> {
  const rows = await em.query<StoredRecord[]>(LOCK_RECORD_SQL, [lichHenId]);
  return rows[0] ?? null;
}

/** Đọc lại dòng vừa ghi trong cùng giao dịch (một câu `SELECT`, không khoá). */
export async function readRecord(
  em: Queryable,
  lichHenId: string,
): Promise<StoredRecord | null> {
  const rows = await em.query<StoredRecord[]>(READ_RECORD_SQL, [lichHenId]);
  return rows[0] ?? null;
}

/** `INSERT` dòng đầu tiên; trả `ho_so_kham_id`. 1062 (không thể xảy ra khi đã khoá `lich_hen`; lưới an toàn) do người gọi bắt. */
export async function insertRecord(
  em: Queryable,
  lichHenId: string,
  content: ValidExamRecord,
  stamp: Date,
): Promise<string> {
  const result = await em.query<{ insertId: string | number }>(
    INSERT_RECORD_SQL,
    [
      lichHenId,
      content.trieuChung,
      content.chanDoanSoBo,
      content.huongXuLy,
      content.ngayTaiKhamDuKien,
      stamp,
    ],
  );
  return String(result.insertId);
}

export async function updateRecord(
  em: Queryable,
  hoSoKhamId: string,
  content: ValidExamRecord,
  stamp: Date,
): Promise<void> {
  await em.query(UPDATE_RECORD_SQL, [
    content.trieuChung,
    content.chanDoanSoBo,
    content.huongXuLy,
    content.ngayTaiKhamDuKien,
    stamp,
    hoSoKhamId,
  ]);
}
