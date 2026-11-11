import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import {
  foldDStroke,
  phoneDigits,
} from '../../patient/validation/keyword-policy.js';

// Mảnh SQL DÙNG CHUNG của mọi danh sách lịch hẹn (B1 Bệnh nhân, B3 Lễ tân, B4 Quản trị viên, B5 Bác sĩ; PLAN booking 5.8; TRACKING 3.17 B3-D). Cùng họ với `list-query.rules.ts` (hàm thuần)
// và `list-query.decorators.ts` (kiểm đầu vào): bộ ba này là MỘT nơi định nghĩa FROM, cột, bộ lọc ngày, ô tìm và sắp xếp nên mỗi danh sách chỉ viết phần riêng của vai trò (điều kiện
// phạm vi và hình dạng kết quả). Mọi giá trị người dùng đi qua tham số `?`, không bao giờ nối vào câu SQL (chỉ chiều sắp xếp, lấy từ hằng `ORDER_BY`). Không ghi log: mã lịch, tên là dữ liệu cá nhân.

export type ListOrder = 'ASC' | 'DESC';

/**
 * Hàng thô của MỘT dòng danh sách (mười hai cột của `ITEM_COLUMNS`). `thoi_gian` và `han_thanh_toan` (DATETIME) ra `Date` nhờ múi giờ của driver (`DB_TIMEZONE`); BIGINT và biểu
 * thức logic ra chuỗi hoặc số tuỳ driver nên `laBanThan` đọc bằng `Number(...)`; tiền đã `CAST … AS CHAR` ở SQL nên là chuỗi decimal. `S` là tập trạng thái mà vai trò được thấy.
 */
export interface ListItemRow<S extends string = TrangThaiLichHen> {
  maLichHen: string;
  trangThai: S;
  thoiGian: Date;
  bacSi: string;
  chuyenKhoa: string;
  chiNhanh: string;
  dichVu: string;
  laBanThan: number | string;
  nguoiKham: string;
  giaSnapshot: string;
  tienCoc: string;
  hanThanhToan: Date | null;
}

// Mọi JOIN trong đều qua khoá ngoại NOT NULL nên không đổi số hàng; không lọc `trang_thai` của bác sĩ hay chuyên khoa (lịch sử vẫn hiện tên). Chuyên khoa lấy qua
// `bac_si.chuyen_khoa_id` HIỆN TẠI (L14). Hồ sơ người thân: LEFT JOIN, vì lịch của bản thân không có hồ sơ; khoá ngoại kép ở `lich_hen` đảm bảo hồ sơ cùng chủ.
export const FROM_APPOINTMENTS = `FROM lich_hen lh
INNER JOIN bac_si bs ON bs.tai_khoan_id = lh.bac_si_id
INNER JOIN tai_khoan tbs ON tbs.tai_khoan_id = lh.bac_si_id
INNER JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = bs.chuyen_khoa_id
INNER JOIN chi_nhanh cn ON cn.chi_nhanh_id = lh.chi_nhanh_id
INNER JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = lh.dich_vu_kham_id
INNER JOIN tai_khoan tbn ON tbn.tai_khoan_id = lh.benh_nhan_id
LEFT JOIN ho_so_nguoi_than hs ON hs.ho_so_nguoi_than_id = lh.ho_so_nguoi_than_id`;

// Danh sách trắng cột, không `SELECT *`: không `lich_hen_id`, `benh_nhan_id`, email hay SĐT bác sĩ (LSH-14, DSV-08). Người khám: bản thân là họ tên tài khoản, người thân là họ tên hồ sơ.
// Mười hai cột của MỘT dòng; câu trang, câu chi tiết của mọi vai trò cùng dùng nên chỉ có một nơi định nghĩa.
export const ITEM_COLUMNS = `SELECT lh.ma_lich_hen AS maLichHen, lh.trang_thai AS trangThai, lh.thoi_gian AS thoiGian,
  tbs.ho_ten AS bacSi, ck.ten AS chuyenKhoa, cn.ten AS chiNhanh, dv.ten AS dichVu,
  (lh.ho_so_nguoi_than_id IS NULL) AS laBanThan, COALESCE(hs.ho_ten, tbn.ho_ten) AS nguoiKham,
  CAST(lh.gia_snapshot AS CHAR) AS giaSnapshot, CAST(lh.tien_coc_snapshot AS CHAR) AS tienCoc,
  lh.han_thanh_toan AS hanThanhToan`;

// Chiều sắp xếp chỉ lấy từ hai hằng này, không từ đầu vào
export const ORDER_BY: Record<ListOrder, string> = {
  ASC: 'ORDER BY lh.thoi_gian ASC, lh.lich_hen_id ASC',
  DESC: 'ORDER BY lh.thoi_gian DESC, lh.lich_hen_id DESC',
};

// Họ tên so sau khi gấp `đ` và `Đ` thành `d` (REPLACE phân biệt hoa thường nên hai lớp; từ khoá cũng đã gấp bằng `foldDStroke`): `đ` không bằng `d` trong
// `utf8mb4_unicode_ci`. Biểu thức chép từ `patient/reception-lookup/patient-lookup.repository.ts` (TECH_DEBT dòng 94): đây là bản DUY NHẤT của booking, B1, B3, B4, B5 dùng chung.
export const foldedName = (column: string) =>
  `REPLACE(REPLACE(${column}, 'đ', 'd'), 'Đ', 'D') LIKE ? ESCAPE '!'`;

/** Các điều kiện `WHERE` (nối bằng AND) và tham số tương ứng, theo đúng thứ tự `?`. Các hàm `add…` bên dưới chỉ THÊM vào, không bao giờ bỏ điều kiện đã có. */
export interface SqlClauses {
  where: string[];
  params: unknown[];
}

/**
 * Điều kiện chi nhánh (phạm vi của Lễ tân, Quản trị viên Chi nhánh): `chiNhanhId` là kết quả của `BranchAccessPolicy.branchFilter` (từ phạm vi đã giải ở DB, không từ query);
 * `undefined` = Quản trị viên Toàn hệ thống không lọc chi nhánh. Gọi ĐẦU TIÊN để điều kiện phạm vi luôn đứng đầu `WHERE` của cả câu đếm, câu trang và câu chi tiết (H10).
 */
export function addBranchFilter(
  clauses: SqlClauses,
  chiNhanhId: string | undefined,
): void {
  if (chiNhanhId === undefined) return;
  clauses.where.push('lh.chi_nhanh_id = ?');
  clauses.params.push(chiNhanhId);
}

/** Tập trạng thái của MỘT câu: đã là giao của mọi giới hạn; rỗng ⇒ không dòng nào (`1 = 0`). Dùng `IN` (không `<>`) để dùng được chỉ mục có `trang_thai`. */
export function addStateFilter(
  clauses: SqlClauses,
  states: readonly TrangThaiLichHen[],
): void {
  if (states.length === 0) {
    clauses.where.push('1 = 0');
    return;
  }
  clauses.where.push(`lh.trang_thai IN (${states.map(() => '?').join(', ')})`);
  clauses.params.push(...states);
}

/** Bộ lọc thu hẹp chung của mọi danh sách; `null` (hoặc thiếu `dichVuKhamId`) = không lọc theo khoá đó. */
export interface CommonFilter {
  bacSiId: string | null;
  chuyenKhoaId: string | null;
  dichVuKhamId?: string | null;
  /** `thoi_gian >= from`; chuỗi `YYYY-MM-DD HH:mm:ss` giờ VN */
  from: string | null;
  /** `thoi_gian < to` */
  to: string | null;
}

/**
 * Bác sĩ, chuyên khoa (qua `bac_si.chuyen_khoa_id` HIỆN TẠI, L14), dịch vụ (snapshot `lich_hen.dich_vu_kham_id`) và khoảng NỬA MỞ trên `thoi_gian`, không bọc cột bằng DATE()
 * (AR-05). Thứ tự điều kiện cố định: bác sĩ, chuyên khoa, dịch vụ, từ ngày, đến ngày.
 */
export function addCommonFilters(
  clauses: SqlClauses,
  filter: CommonFilter,
): void {
  if (filter.bacSiId !== null) {
    clauses.where.push('lh.bac_si_id = ?');
    clauses.params.push(filter.bacSiId);
  }
  if (filter.chuyenKhoaId !== null) {
    clauses.where.push('bs.chuyen_khoa_id = ?');
    clauses.params.push(filter.chuyenKhoaId);
  }
  if (filter.dichVuKhamId !== undefined && filter.dichVuKhamId !== null) {
    clauses.where.push('lh.dich_vu_kham_id = ?');
    clauses.params.push(filter.dichVuKhamId);
  }
  if (filter.from !== null) {
    clauses.where.push('lh.thoi_gian >= ?');
    clauses.params.push(filter.from);
  }
  if (filter.to !== null) {
    clauses.where.push('lh.thoi_gian < ?');
    clauses.params.push(filter.to);
  }
}

/**
 * Cột để khớp `q` ngoài mã lịch (LUÔN có, nguyên văn) và tên bác sĩ của dòng (có, trừ khi `doctorName` là `false`): tên (gấp `đ`) và, nếu có, SĐT (chỉ chữ số, bỏ dấu cách và chấm:
 * `phoneDigits`). `doctorName: false` dành cho danh sách của CHÍNH Bác sĩ (B5): mọi dòng đều có tên họ, gõ một chữ trong tên mình sẽ khớp MỌI dòng; B1, B3, B4 không khai nên giữ nguyên.
 */
export interface KeywordTargets {
  nameColumns: readonly string[];
  phoneColumn?: string;
  /** Mặc định `true`: khớp `tbs.ho_ten` (tên bác sĩ của dòng). */
  doctorName?: boolean;
}

/**
 * Ô tìm `q` (Q35): một điều kiện `(… OR …)` khớp CHỨA, không phân biệt hoa thường và dấu nhờ collation (`đ` do `foldedName`). `keyword` đã chuẩn hoá và hợp lệ (2 đến 100 ký tự);
 * `%`, `_`, `!` là ký tự thường (`escapeLikePattern`). Thứ tự tham số theo thứ tự điều kiện: mã lịch, tên bác sĩ (trừ khi `doctorName === false`), các cột tên của `targets`, SĐT (nếu có và
 * `q` toàn chữ số).
 */
export function addKeywordFilter(
  clauses: SqlClauses,
  keyword: string | null,
  targets: KeywordTargets,
): void {
  if (keyword === null) return;
  const code = `%${escapeLikePattern(keyword)}%`;
  const name = `%${escapeLikePattern(foldDStroke(keyword))}%`;
  const withDoctorName = targets.doctorName !== false;
  const conditions = [
    `lh.ma_lich_hen LIKE ? ESCAPE '!'`,
    ...(withDoctorName ? [foldedName('tbs.ho_ten')] : []),
    ...targets.nameColumns.map(foldedName),
  ];
  const params = [
    code,
    ...(withDoctorName ? [name] : []),
    ...targets.nameColumns.map(() => name),
  ];
  const digits =
    targets.phoneColumn === undefined ? null : phoneDigits(keyword);
  if (targets.phoneColumn !== undefined && digits !== null) {
    conditions.push(`${targets.phoneColumn} LIKE ? ESCAPE '!'`);
    params.push(`%${escapeLikePattern(digits)}%`);
  }
  clauses.where.push(`(${conditions.join(' OR ')})`);
  clauses.params.push(...params);
}

/**
 * `FROM … WHERE …` dùng CHUNG cho các câu của một danh sách (đếm, nhóm, trang), dựng một lần nên số đếm luôn đúng tập mà trang cắt ra. `where` không được rỗng (luôn có điều kiện phạm vi hoặc
 * trạng thái). `joins` (mặc định rỗng) là các `JOIN` cộng thêm giữa `FROM` và `WHERE` (B5 nối `khung_gio`, `lich_lam_viec` để lấy `ca`); B1, B3, B4 không truyền nên SQL của họ không đổi.
 */
export function fromWhere(
  clauses: SqlClauses,
  joins = '',
): {
  sql: string;
  params: unknown[];
} {
  return {
    sql: `${FROM_APPOINTMENTS}${joins === '' ? '' : `\n${joins}`}\nWHERE ${clauses.where.join('\n  AND ')}`,
    params: clauses.params,
  };
}
