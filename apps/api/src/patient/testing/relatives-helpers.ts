import type { DataSource } from 'typeorm';
import { resetTables } from '../../database/testing/test-database.js';
import type { NewRelative } from '../relatives/relatives.repository.js';

// Hàm trợ giúp DÙNG CHUNG của test tích hợp và e2e hồ sơ người thân (task B3; TRACKING patient B3-A, B3-G). Gom một chỗ để hai file
// (relatives.service.int-spec.ts, test/patient-relatives.e2e-spec.ts) không chép nhau: CI chỉ bỏ `**/*.spec.ts` khỏi jscpd nên `*.int-spec.ts` vẫn bị quét.
// Dữ liệu cá nhân trong test là giả; không CCCD thật.

/** 2^53 + 1: id đầu tiên mà `Number` không còn biểu diễn chính xác. */
export const BIG_ID = '9007199254740993';

/** Đúng bảy khoá của một hồ sơ người thân trong phản hồi (đã sắp xếp). Không có `benhNhanId`, `diaChi`. */
export const RELATIVE_KEYS = [
  'gioiTinh',
  'hoSoNguoiThanId',
  'hoTen',
  'moiQuanHe',
  'ngaySinh',
  'soDienThoai',
  'trangThaiHieuLuc',
];

/** Các bảng mà tạo hồ sơ người thân KHÔNG được đụng tới (chụp ảnh trước/sau, mẫu PFI-14 và PUI-01). */
export const UNTOUCHED_TABLES = [
  'tai_khoan',
  'benh_nhan',
  'vi_noi_bo',
  'lich_hen',
  'nhat_ky_hanh_dong',
  'thong_bao',
];

/** Thân tạo hợp lệ, SĐT để trống. */
export const NEW_RELATIVE: NewRelative = {
  hoTen: 'Trần Thị Con Giả',
  moiQuanHe: 'Con',
  gioiTinh: 'Nu',
  ngaySinh: '2018-03-04',
  soDienThoai: null,
};

/** Thân tạo thứ `n`: mỗi `n` một bộ riêng (họ tên, ngày sinh) để biết hồ sơ nào là của lần gửi nào. */
export function relativeInput(n: number): NewRelative {
  const day = String((n % 28) + 1).padStart(2, '0');
  return {
    hoTen: `Người Thân Số ${String(n)}`,
    moiQuanHe: 'Con',
    gioiTinh: n % 2 === 0 ? 'Nam' : 'Nu',
    ngaySinh: `2010-05-${day}`,
    soDienThoai: n % 3 === 0 ? `09100000${String(n).padStart(2, '0')}` : null,
  };
}

/** Hàng `ho_so_nguoi_than` nguyên văn trong DB (tên cột DB; `ngay_sinh` qua DATE_FORMAT để không lệch múi giờ). */
export interface StoredRelative {
  ho_so_nguoi_than_id: string;
  benh_nhan_id: string;
  ho_ten: string;
  ngay_sinh: string;
  gioi_tinh: string;
  dia_chi: string | null;
  moi_quan_he: string;
  so_dien_thoai: string | null;
  trang_thai_hieu_luc: number;
}

const STORED_SQL = `SELECT ho_so_nguoi_than_id, benh_nhan_id, ho_ten, DATE_FORMAT(ngay_sinh, '%Y-%m-%d') AS ngay_sinh,
  gioi_tinh, dia_chi, moi_quan_he, so_dien_thoai, trang_thai_hieu_luc FROM ho_so_nguoi_than`;

/** Mọi hàng của bảng (hoặc của một chủ sở hữu), theo id tăng dần. */
export function storedRows(
  db: DataSource,
  ownerId?: string,
): Promise<StoredRelative[]> {
  return ownerId === undefined
    ? db.query<StoredRelative[]>(`${STORED_SQL} ORDER BY ho_so_nguoi_than_id`)
    : db.query<StoredRelative[]>(
        `${STORED_SQL} WHERE benh_nhan_id = ? ORDER BY ho_so_nguoi_than_id`,
        [ownerId],
      );
}

/** Chèn THẲNG bằng SQL một hồ sơ (kể cả đã ngừng: B3 chưa có cách ngừng qua API). Trả id dạng chuỗi. */
export async function insertRelativeRow(
  db: DataSource,
  ownerId: string,
  fields: { hoTen: string; active: boolean },
): Promise<string> {
  await db.query(
    `INSERT INTO ho_so_nguoi_than (benh_nhan_id, ho_ten, ngay_sinh, gioi_tinh, moi_quan_he, trang_thai_hieu_luc)
     VALUES (?, ?, '2000-01-01', 'Nam', 'Con', ?)`,
    [ownerId, fields.hoTen, fields.active],
  );
  const rows = await db.query<{ id: string }[]>(
    'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id',
  );
  return rows[0]?.id ?? '0';
}

/**
 * Chạy `work` với `AUTO_INCREMENT` của `ho_so_nguoi_than` đặt sẵn, và LUÔN trả bảng về trạng thái sạch trong `finally` (kể cả khi `work` ném lỗi),
 * để ca đỏ không để lại id lớn cho ca sau hay file sau. `resetTables` dùng TRUNCATE nên AUTO_INCREMENT về 1.
 */
export async function withAutoIncrement<T>(
  db: DataSource,
  start: string,
  work: () => Promise<T>,
): Promise<T> {
  try {
    await db.query(`ALTER TABLE ho_so_nguoi_than AUTO_INCREMENT=${start}`);
    return await work();
  } finally {
    await resetTables(db);
  }
}

/**
 * Giá trị AUTO_INCREMENT kế tiếp của `ho_so_nguoi_than` (chuỗi); `null` khi bảng rỗng và InnoDB chưa khởi tạo bộ đếm (sau TRUNCATE; tương đương 1). MySQL 8 lưu đệm thống kê của information_schema (mặc định 24 giờ), nên đặt
 * `information_schema_stats_expiry = 0` ở CÙNG kết nối với câu đọc, nếu không có thể thấy số cũ.
 */
export async function nextAutoIncrement(
  db: DataSource,
): Promise<string | null> {
  const runner = db.createQueryRunner();
  try {
    await runner.query('SET SESSION information_schema_stats_expiry = 0');
    const rows: { next: string | null }[] = await runner.query(
      `SELECT CAST(AUTO_INCREMENT AS CHAR) AS next FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ho_so_nguoi_than'`,
    );
    return rows[0]?.next ?? null;
  } finally {
    await runner.release();
  }
}

/** Xoá `vi_noi_bo` rồi `benh_nhan` của một tài khoản: tài khoản vẫn đăng nhập được nhưng KHÔNG còn hàng cha cho khoá ngoại (H13). */
export async function removePatientRows(
  db: DataSource,
  accountId: string,
): Promise<void> {
  await db.query('DELETE FROM vi_noi_bo WHERE benh_nhan_id = ?', [accountId]);
  await db.query('DELETE FROM benh_nhan WHERE tai_khoan_id = ?', [accountId]);
}
