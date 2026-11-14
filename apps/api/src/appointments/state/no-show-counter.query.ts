import type { EntityManager } from 'typeorm';

// Bộ đếm no-show và cờ khoá đặt lịch của MỘT bệnh nhân (task B12; TRACKING 3.26 B12-D; PLAN booking 5.7, Q14, Q25). Là NƠI DUY NHẤT trong `appointments/` ghi `benh_nhan` (luật AR-06 mẫu `UPDATE benh_nhan`
// chỉ ở `appointments/state/`): bảng `benh_nhan` thuộc auth và patient, booking chỉ được đụng hai cột này. Tất cả nhận `em` của người gọi, KHÔNG mở giao dịch. Khoá `benh_nhan` là TẦNG 2 của bảng
// 5.3: đứng TRƯỚC `lich_hen` (tầng 6) nên hai lịch của cùng một tài khoản bị đánh Vắng mặt đồng thời nối đuôi nhau ở đây (VM-15, DT-15) và không đua với `create` (cũng khoá `benh_nhan` đầu tiên).
// Mọi câu tra theo khoá chính `tai_khoan_id` (một hàng, không quét).

export interface NoShowCounter {
  /** `so_lan_no_show` */
  soLan: number;
  /** `khoa_dat_lich_do_no_show` */
  khoa: boolean;
}

interface RawCounter {
  soLan: number | string;
  khoa: number | string;
}

const READ_SQL = `SELECT so_lan_no_show AS soLan, khoa_dat_lich_do_no_show AS khoa
FROM benh_nhan WHERE tai_khoan_id = ?`;

// Cộng NGAY trong SQL (không đọc rồi ghi lại giá trị tính ở ứng dụng), nên kể cả khi có luồng khác ghi mà quên khoá thì số không bị ghi đè
const INCREMENT_SQL = `UPDATE benh_nhan SET so_lan_no_show = so_lan_no_show + 1
WHERE tai_khoan_id = ?`;

// `khoa_dat_lich_do_no_show = 0` lặp lại trong `UPDATE`: lưới an toàn (đúng 1 hàng ⇒ vừa chuyển `false` sang `true`)
const LOCK_FLAG_SQL = `UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1
WHERE tai_khoan_id = ? AND khoa_dat_lich_do_no_show = 0`;

// `boolean` của MySQL là `tinyint` (ra 1 hoặc 0), `int` có thể ra số hoặc chuỗi tuỳ driver
const toCounter = (row: RawCounter | undefined): NoShowCounter | null =>
  row === undefined
    ? null
    : { soLan: Number(row.soLan), khoa: Number(row.khoa) === 1 };

/** `FOR UPDATE` theo khoá chính (tầng 2) và đọc giá trị MỚI NHẤT; `null` nếu tài khoản không có hàng `benh_nhan`. */
export async function lockNoShowCounter(
  em: EntityManager,
  taiKhoanId: string,
): Promise<NoShowCounter | null> {
  const rows = await em.query<RawCounter[]>(`${READ_SQL} FOR UPDATE`, [
    taiKhoanId,
  ]);
  return toCounter(rows[0]);
}

/** Đọc lại (người gọi đang giữ khoá nên là giá trị của chính giao dịch này); `null` nếu không có hàng. */
export async function readNoShowCounter(
  em: EntityManager,
  taiKhoanId: string,
): Promise<NoShowCounter | null> {
  const rows = await em.query<RawCounter[]>(READ_SQL, [taiKhoanId]);
  return toCounter(rows[0]);
}

/** `so_lan_no_show` cộng 1. `true` khi đúng 1 hàng bị ảnh hưởng. */
export async function incrementNoShow(
  em: EntityManager,
  taiKhoanId: string,
): Promise<boolean> {
  const result: { affectedRows?: number } = await em.query(INCREMENT_SQL, [
    taiKhoanId,
  ]);
  return result.affectedRows === 1;
}

/** Bật cờ khoá đặt lịch, CHỈ khi cờ đang tắt. `true` khi đúng 1 hàng bị ảnh hưởng (cờ vừa chuyển `false` sang `true`). */
export async function setNoShowLock(
  em: EntityManager,
  taiKhoanId: string,
): Promise<boolean> {
  const result: { affectedRows?: number } = await em.query(LOCK_FLAG_SQL, [
    taiKhoanId,
  ]);
  return result.affectedRows === 1;
}
