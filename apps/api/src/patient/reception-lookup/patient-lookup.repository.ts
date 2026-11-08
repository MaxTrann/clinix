import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { LookupPatterns } from '../validation/keyword-policy.js';
import type {
  PatientDetailProfile,
  PatientLookupItem,
} from './patient-lookup.dto.js';

// Hàng thô của câu SELECT trang: `tai_khoan_id` (BIGINT) ra chuỗi nhờ cấu hình driver (bigNumberStrings, như B3), không qua Number.
interface LookupRow extends PatientLookupItem {
  [column: string]: unknown;
}

// Hàng thô của câu SELECT chi tiết (B7): `thoi_diem_tao` (DATETIME) ra `Date` nhờ múi giờ của driver (`DB_TIMEZONE`), nên ISO không phụ thuộc múi giờ tiến trình
// (đã đo ở 6 múi giờ, TRACKING B7-C); `so_lan_no_show` (INT) ra số. Chữ ký chỉ mục cho phép hàng thô có cột thừa: `toDetail` không chép chúng.
interface DetailRow extends Omit<PatientDetailProfile, 'thoiDiemTao'> {
  thoiDiemTao: Date;
  [column: string]: unknown;
}

// Chỉ ĐỌC `tai_khoan` và `benh_nhan` (PLAN 5.4): không `le_tan`, `lich_hen` (phạm vi toàn hệ thống, Q16), không `vi_noi_bo`, `ma_xac_thuc`, `phien_dang_nhap`.
// INNER JOIN: dòng `benh_nhan` chỉ có khi đã xác minh email (Q17). `loai_tai_khoan = 'BenhNhan'` giữ riêng, vì khoá ngoại của `benh_nhan` không bắt tài khoản phải là Bệnh nhân.
// KHÔNG lọc `trang_thai`: tài khoản NgungHoatDong vẫn hiện, kèm `trangThai` (Q17).
const FROM_PATIENTS = `FROM tai_khoan t
INNER JOIN benh_nhan b ON b.tai_khoan_id = t.tai_khoan_id
WHERE t.loai_tai_khoan = 'BenhNhan'`;

// Họ tên so sau khi gấp `đ`/`Đ` thành `d` (REPLACE phân biệt hoa thường nên phải hai lớp; từ khoá cũng đã gấp ở buildLookupPatterns). Chỉ họ tên:
// email là ASCII, SĐT là số. Cột không có chỉ mục dùng được cho `LIKE '%…%'` nên REPLACE không làm mất gì (TECH_DEBT: quét toàn bảng).
const NAME_CONDITION = `REPLACE(REPLACE(t.ho_ten, 'đ', 'd'), 'Đ', 'D') LIKE ? ESCAPE '!'`;
const EMAIL_CONDITION = `t.email LIKE ? ESCAPE '!'`;
const PHONE_CONDITION = `t.so_dien_thoai LIKE ? ESCAPE '!'`;

// Liệt kê tường minh, không `SELECT *`: không mật khẩu băm, khoá đăng nhập, ngày sinh, địa chỉ, mã nội bộ khác (H4, Q18).
const PAGE_COLUMNS = `SELECT t.tai_khoan_id AS taiKhoanId, t.ho_ten AS hoTen, t.so_dien_thoai AS soDienThoai, t.email AS email, t.trang_thai AS trangThai`;

// Sắp theo họ tên rồi mã tài khoản: `ho_ten` so theo collation nên 'An' và 'Ân' bằng nhau, khoá thứ hai làm thứ tự ổn định giữa các trang.
const PAGE_ORDER = 'ORDER BY t.ho_ten ASC, t.tai_khoan_id ASC LIMIT ? OFFSET ?';

// Chi tiết một bệnh nhân (task B7; PLAN 5.4, 5.7): ĐÚNG chín cột, không `SELECT *` (không mật khẩu băm, khoá đăng nhập, ảnh, loại tài khoản, cờ khoá đặt lịch).
//  - `ngay_sinh` PHẢI qua DATE_FORMAT: cột DATE ra `Date` lệch múi giờ ở câu SQL thô (1900-01-01 ra 1899-12-31T17:00:00.000Z ở +07:00).
//  - `so_lan_no_show` đặt tên `soLanVangMat` (hợp đồng PLAN 5.7); chỉ cột của `benh_nhan`, không đọc `lich_hen`.
const DETAIL_COLUMNS = `SELECT t.ho_ten AS hoTen, t.email AS email, t.so_dien_thoai AS soDienThoai, t.gioi_tinh AS gioiTinh,
  DATE_FORMAT(t.ngay_sinh, '%Y-%m-%d') AS ngaySinh, t.dia_chi AS diaChi, t.thoi_diem_tao AS thoiDiemTao,
  t.trang_thai AS trangThai, b.so_lan_no_show AS soLanVangMat`;

// CÙNG `FROM_PATIENTS` với danh sách: "ai tra cứu được" chỉ có MỘT định nghĩa (INNER JOIN `benh_nhan` loại Bệnh nhân chưa xác minh; `loai_tai_khoan` loại
// một dòng `benh_nhan` hỏng của tài khoản khác loại). Id là tham số `?` (chuỗi: BIGINT lớn hơn 2^53 không qua Number); không lọc `trang_thai` (Q17).
const FIND_DETAIL_SQL = `${DETAIL_COLUMNS} ${FROM_PATIENTS}
  AND t.tai_khoan_id = ?`;

/**
 * Một điều kiện duy nhất cho CẢ câu đếm lẫn câu trang (dựng một lần, không viết hai lần) nên `total` luôn đếm đúng tập mà trang cắt ra.
 * Điều kiện SĐT và tham số của nó chỉ có khi nhánh SĐT bật. Thứ tự tham số: họ tên, email, [SĐT].
 */
function filterOf(patterns: LookupPatterns): { sql: string; params: string[] } {
  const conditions = [NAME_CONDITION, EMAIL_CONDITION];
  const params = [patterns.name, patterns.email];
  if (patterns.phone !== null) {
    conditions.push(PHONE_CONDITION);
    params.push(patterns.phone);
  }
  return {
    sql: `${FROM_PATIENTS}\n  AND (${conditions.join(' OR ')})`,
    params,
  };
}

// Chọn từng khoá một (không trải nguyên hàng) để cột thừa không bao giờ lọt ra ngoài
function toItem(row: LookupRow): PatientLookupItem {
  return {
    taiKhoanId: row.taiKhoanId,
    hoTen: row.hoTen,
    soDienThoai: row.soDienThoai,
    email: row.email,
    trangThai: row.trangThai,
  };
}

// Chọn từng khoá một, đúng thứ tự của PLAN 5.7; `thoiDiemTao` thành chuỗi ISO 8601 UTC ngay tại đây để `Date` không đi qua JSON
function toDetail(row: DetailRow): PatientDetailProfile {
  return {
    hoTen: row.hoTen,
    email: row.email,
    soDienThoai: row.soDienThoai,
    gioiTinh: row.gioiTinh,
    ngaySinh: row.ngaySinh,
    diaChi: row.diaChi,
    thoiDiemTao: row.thoiDiemTao.toISOString(),
    trangThai: row.trangThai,
    soLanVangMat: row.soLanVangMat,
  };
}

/**
 * Tra cứu bệnh nhân cho Lễ tân (task B6; PLAN patient 5.4). Chỉ đọc: không giao dịch, không khoá. Mọi giá trị người dùng đi qua tham số `?`,
 * không bao giờ nối vào câu SQL. Không ghi log: từ khoá, họ tên, email, SĐT là dữ liệu cá nhân (H5).
 */
@Injectable()
export class PatientLookupRepository {
  /** Số bệnh nhân khớp (cùng điều kiện với `findPage`). `COUNT(*)` là BIGINT nên ra chuỗi. */
  async count(em: EntityManager, patterns: LookupPatterns): Promise<number> {
    const filter = filterOf(patterns);
    const rows: { total: string | number }[] = await em.query(
      `SELECT COUNT(*) AS total ${filter.sql}`,
      filter.params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  /** Một trang, sắp theo họ tên rồi mã tài khoản. */
  async findPage(
    em: EntityManager,
    patterns: LookupPatterns,
    limit: number,
    offset: number,
  ): Promise<PatientLookupItem[]> {
    const filter = filterOf(patterns);
    const rows: LookupRow[] = await em.query(
      `${PAGE_COLUMNS} ${filter.sql} ${PAGE_ORDER}`,
      [...filter.params, limit, offset],
    );
    return rows.map(toItem);
  }

  /**
   * Chi tiết hồ sơ BẢN THÂN của MỘT bệnh nhân (task B7); `null` nếu không có hàng: id không tồn tại, là tài khoản không phải Bệnh nhân, hoặc Bệnh nhân chưa xác minh
   * (service đổi thành 404 cùng thân, Q27). Một câu SELECT thường, chỉ `tai_khoan` và `benh_nhan`; người thân do `RelativesRepository.findRelatives` lo.
   */
  async findDetail(
    em: EntityManager,
    id: string,
  ): Promise<PatientDetailProfile | null> {
    const rows: DetailRow[] = await em.query(FIND_DETAIL_SQL, [id]);
    const row = rows[0];
    return row === undefined ? null : toDetail(row);
  }
}
