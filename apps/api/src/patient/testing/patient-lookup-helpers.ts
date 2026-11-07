import type { DataSource } from 'typeorm';
import type { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import type { TrangThaiTaiKhoan } from '../../auth/entities/enums.js';
import { insertTaiKhoan } from '../../auth/entities/testing/auth-fixtures.js';
import { resetTables } from '../../database/testing/test-database.js';
import type { PatientLookupPage } from '../reception-lookup/patient-lookup.dto.js';
import { insertRelativeRow } from './relatives-helpers.js';

// Hàm trợ giúp DÙNG CHUNG của test tích hợp và e2e tra cứu bệnh nhân (task B6; TRACKING patient B6-G, B6-H). Gom một chỗ để hai file
// (patient-lookup.int-spec.ts, test/patient-lookup.e2e-spec.ts) không chép nhau: CI chỉ bỏ `**/*.spec.ts` khỏi jscpd nên `*.int-spec.ts` vẫn bị quét.
// Dữ liệu cá nhân trong test là giả (email đuôi .invalid); không CCCD thật.

/** Đúng năm khoá của một dòng danh sách (đã sắp xếp). Không có mật khẩu băm, ngày sinh, địa chỉ, `soLanNoShow`… */
export const ITEM_KEYS = [
  'email',
  'hoTen',
  'soDienThoai',
  'taiKhoanId',
  'trangThai',
];

/** Đúng bốn khoá của phản hồi phân trang (đã sắp xếp). */
export const PAGE_KEYS = ['items', 'page', 'pageSize', 'total'];

/** Các bảng mà tra cứu KHÔNG được đổi (TC-14, TC-16): chụp mọi hàng trước và sau. */
export const LOOKUP_UNTOUCHED_TABLES = [
  'tai_khoan',
  'benh_nhan',
  'vi_noi_bo',
  'ho_so_nguoi_than',
  'lich_hen',
  'le_tan',
  'ma_xac_thuc',
  'phien_dang_nhap',
  'nhat_ky_hanh_dong',
  'thong_bao',
];

/** Các bảng mà tra cứu KHÔNG được ĐỌC (PLI-12): MySQL tự đếm lượt đọc của từng bảng. */
export const LOOKUP_UNREAD_TABLES = [
  'lich_hen',
  'le_tan',
  'vi_noi_bo',
  'ma_xac_thuc',
  'phien_dang_nhap',
  'ho_so_nguoi_than',
];

export interface PatientSeed {
  hoTen: string;
  email?: string;
  soDienThoai?: string;
  trangThai?: Extract<TrangThaiTaiKhoan, 'DangHoatDong' | 'NgungHoatDong'>;
}

let sequence = 0;

// Số thành chữ cái (a, b, …, z, ba, bb, …): email mặc định không chứa chữ số nên không bao giờ khớp nhầm một từ khoá toàn chữ số
const letters = (n: number): string => {
  let rest = n;
  let out = '';
  do {
    out = String.fromCharCode(97 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  } while (rest > 0);
  return out;
};

/**
 * Thêm một Bệnh nhân ĐÃ xác minh (có dòng `benh_nhan`); trả mã tài khoản. Email và SĐT mặc định RIÊNG mỗi lần gọi (`bn<chữ cái>@example.invalid`, `0300<n>00`):
 * giá trị mặc định của fixture (`nguoi.dung.<n>@example.com`, cùng một SĐT) sẽ khiến mọi bệnh nhân cùng khớp một từ khoá.
 */
export async function addPatient(
  fx: AdminFixtures,
  seed: PatientSeed,
): Promise<string> {
  sequence += 1;
  const n = String(sequence).padStart(4, '0');
  return (
    await fx.patient({
      email: `bn${letters(sequence)}@example.invalid`,
      soDienThoai: `0300${n}00`,
      ...seed,
    })
  ).account.taiKhoanId;
}

/**
 * Thêm `count` Bệnh nhân đã xác minh cùng họ tên bằng SQL thô (nhanh, và trả id dưới dạng CHUỖI: id lớn hơn 2^53 không đi qua Number như khi dùng repository của
 * TypeORM). Trả mã tài khoản theo thứ tự tăng dần. Dùng cho thử phân trang và id BIGINT lớn.
 */
export async function addManyPatients(
  db: DataSource,
  count: number,
  hoTen: string,
): Promise<string[]> {
  sequence += 1;
  const batch = sequence;
  const emails = Array.from(
    { length: count },
    (_, i) => `bulk${letters(batch)}-${letters(i)}@example.invalid`,
  );
  const row = "(?, '0300000000', ?, 'x', 'DangHoatDong', TRUE, 'BenhNhan')";
  await db.query(
    `INSERT INTO tai_khoan (ho_ten, so_dien_thoai, email, mat_khau_bam, trang_thai, da_xac_minh_email, loai_tai_khoan)
     VALUES ${emails.map(() => row).join(', ')}`,
    emails.flatMap((email) => [hoTen, email]),
  );
  const rows: { id: string }[] = await db.query(
    `SELECT CAST(tai_khoan_id AS CHAR) AS id FROM tai_khoan WHERE email IN (${emails.map(() => '?').join(', ')}) ORDER BY tai_khoan_id`,
    emails,
  );
  const ids = rows.map((r) => r.id);
  await db.query(
    `INSERT INTO benh_nhan (tai_khoan_id) VALUES ${ids.map(() => '(?)').join(', ')}`,
    ids,
  );
  return ids;
}

/**
 * Thêm một Bệnh nhân kèm dữ liệu ở các bảng mà tra cứu KHÔNG được đổi hay đọc: một hồ sơ người thân, một Lễ tân và một lịch hẹn. Trả mã tài khoản của Bệnh nhân.
 * Gom một chỗ để PLI-10 và PLI-12 không chép phần dựng (jscpd tính cả `*.int-spec.ts`).
 */
export async function addPatientWithLinkedData(
  db: DataSource,
  fx: AdminFixtures,
  seed: PatientSeed,
): Promise<string> {
  const owner = await addPatient(fx, seed);
  await insertRelativeRow(db, owner, { hoTen: 'Người Thân', active: true });
  const branch = await fx.branch();
  await fx.receptionist(branch);
  const doctor = await fx.doctor(branch);
  const slot = await fx.slot(await fx.shift(doctor.profile));
  await fx.appointment(doctor.profile, slot, owner, { trangThai: 'DaXacNhan' });
  return owner;
}

/** Thêm một tài khoản Bệnh nhân CHƯA xác minh email: không có dòng `benh_nhan` (nó chỉ được tạo khi OTP đúng). */
export async function addUnverifiedPatient(
  db: DataSource,
  seed: PatientSeed,
): Promise<string> {
  const account = await insertTaiKhoan(db, {
    ...seed,
    daXacMinhEmail: false,
    loaiTaiKhoan: 'BenhNhan',
  });
  return account.taiKhoanId;
}

/** Họ tên theo thứ tự trả về. */
export const namesOf = (page: PatientLookupPage): string[] =>
  page.items.map((item) => item.hoTen);

/** Mã tài khoản theo thứ tự trả về. */
export const idsOf = (page: PatientLookupPage): string[] =>
  page.items.map((item) => item.taiKhoanId);

/** So hai danh sách theo TẬP (không theo thứ tự). */
export const sortedCopy = (values: readonly string[]): string[] =>
  [...values].sort();

/**
 * Số lượt ĐỌC (`COUNT_READ`) của từng bảng, do MySQL tự đếm ở `performance_schema.table_io_waits_summary_by_table`.
 * Là "máy dò đọc bảng" của PLI-12. Nếu `performance_schema` bị tắt thì NÉM LỖI rõ ràng, không im lặng bỏ qua (quyết định B6).
 */
export async function readCounts(
  db: DataSource,
  tables: readonly string[],
): Promise<Record<string, number>> {
  const flag: { enabled: number | string }[] = await db.query(
    'SELECT @@performance_schema AS enabled',
  );
  if (Number(flag[0]?.enabled) !== 1) {
    throw new Error(
      'performance_schema đang tắt: không đếm được lượt đọc bảng. Bật performance_schema trên MySQL test (mặc định của mysql:8.4 là bật).',
    );
  }
  const rows: { name: string; read_count: string }[] = await db.query(
    `SELECT OBJECT_NAME AS name, CAST(COUNT_READ AS CHAR) AS read_count
       FROM performance_schema.table_io_waits_summary_by_table
      WHERE OBJECT_SCHEMA = DATABASE() AND OBJECT_NAME IN (${tables.map(() => '?').join(', ')})`,
    [...tables],
  );
  const counts = Object.fromEntries(tables.map((t) => [t, -1]));
  for (const row of rows) counts[row.name] = Number(row.read_count);
  const missing = tables.filter((t) => counts[t] === -1);
  if (missing.length > 0) {
    throw new Error(
      `performance_schema không có bộ đếm cho bảng: ${missing.join(', ')}`,
    );
  }
  return counts;
}

/**
 * Chạy `work` với `AUTO_INCREMENT` của `tai_khoan` đặt sẵn, và LUÔN trả bảng về trạng thái sạch trong `finally` (kể cả khi `work` ném lỗi), để ca đỏ không để lại
 * id lớn cho ca sau hay file sau. Dùng để thử `taiKhoanId` lớn hơn 2^53 ra đúng chuỗi.
 */
export async function withAccountAutoIncrement<T>(
  db: DataSource,
  start: string,
  work: () => Promise<T>,
): Promise<T> {
  try {
    await db.query(`ALTER TABLE tai_khoan AUTO_INCREMENT=${start}`);
    return await work();
  } finally {
    await resetTables(db);
  }
}
