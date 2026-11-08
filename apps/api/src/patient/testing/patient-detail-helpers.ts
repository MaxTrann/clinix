import type { DataSource } from 'typeorm';
import type { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import type { TrangThaiTaiKhoan } from '../../auth/entities/enums.js';
import type { PatientDetailRelative } from '../reception-lookup/patient-lookup.dto.js';
import {
  RelativesRepository,
  type NewRelative,
} from '../relatives/relatives.repository.js';
import {
  addPatient,
  addUnverifiedPatient,
  LOOKUP_UNREAD_TABLES,
  type PatientSeed,
} from './patient-lookup-helpers.js';

// Hàm trợ giúp DÙNG CHUNG của test tích hợp và e2e chi tiết bệnh nhân (task B7; TRACKING patient B7-G, B7-H). Gom một chỗ để hai file
// (patient-lookup.detail.int-spec.ts, test/patient-lookup-detail.e2e-spec.ts) không chép nhau: CI chỉ bỏ `**/*.spec.ts` khỏi jscpd nên `*.int-spec.ts` vẫn bị quét.
// Dữ liệu cá nhân trong test là giả (email đuôi .invalid); không CCCD thật.

/** Đúng mười khoá của thân 200 (đã sắp xếp). Không có `taiKhoanId`, mật khẩu băm, `loaiTaiKhoan`, `anhDaiDien`, cờ khoá đặt lịch. */
export const DETAIL_KEYS = [
  'diaChi',
  'email',
  'gioiTinh',
  'hoTen',
  'ngaySinh',
  'nguoiThan',
  'soDienThoai',
  'soLanVangMat',
  'thoiDiemTao',
  'trangThai',
].sort();

/** Đúng sáu khoá của một người thân (đã sắp xếp). Không có `hoSoNguoiThanId`, `benhNhanId`, `diaChi`. */
export const DETAIL_RELATIVE_KEYS = [
  'gioiTinh',
  'hoTen',
  'moiQuanHe',
  'ngaySinh',
  'soDienThoai',
  'trangThaiHieuLuc',
].sort();

/**
 * Các bảng mà chi tiết KHÔNG được đọc (PDI-12): của B6 bỏ `ho_so_nguoi_than`, vì chi tiết CÓ đọc bảng đó (người thân).
 */
export const DETAIL_UNREAD_TABLES = LOOKUP_UNREAD_TABLES.filter(
  (table) => table !== 'ho_so_nguoi_than',
);

/** Thân 404 chung (Q27): giống từng ký tự ở mọi nhánh, kể cả id sai dạng bị pipe từ chối. */
export const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';

/** Một mã tài khoản không có trong DB (sau `resetTables` các id đều nhỏ). */
export const MISSING_ID = '987654321';

/** Mười bảy dạng id sai trên đường dẫn đã đo ở TRACKING B7-D (đã mã hoá phần trăm nếu cần): pipe trả 404 cho tất cả. */
export const MALFORMED_IDS: readonly [string, string][] = [
  ['0', '0'],
  ['-1', '-1'],
  ['1.5', '1.5'],
  ['1e3', '1e3'],
  ['đầu cách', '%201'],
  ['cuối cách', '1%20'],
  ['01', '01'],
  ['+1', '+1'],
  ['0x1', '0x1'],
  ['1_000', '1_000'],
  ['xuống dòng', '1%0A'],
  ['NUL', '%00'],
  ['tràn BIGINT', '9223372036854775808'],
  ['20 chữ số', '99999999999999999999'],
  ['abc', 'abc'],
  ['chữ số Ả Rập', encodeURIComponent('١٢٣')],
  ['chữ số toàn rộng', encodeURIComponent('１２３')],
];

export interface DetailSeed {
  hoTen?: string;
  email?: string;
  soDienThoai?: string;
  gioiTinh?: string | null;
  /** `YYYY-MM-DD` hoặc `null`. */
  ngaySinh?: string | null;
  diaChi?: string | null;
  trangThai?: Extract<TrangThaiTaiKhoan, 'DangHoatDong' | 'NgungHoatDong'>;
  /** Giờ Việt Nam dạng `YYYY-MM-DD HH:mm:ss`, ghi thẳng vào `thoi_diem_tao` (DB lưu giờ VN). */
  thoiDiemTaoVN?: string;
  soLanVangMat?: number;
}

/**
 * Thêm một Bệnh nhân đã xác minh có đủ trường hồ sơ; trả mã tài khoản. Trường không nêu để mặc định của DB (`null`). Email và SĐT mặc định RIÊNG mỗi lần (xem `addPatient`):
 * chỉ truyền cho `addPatient` những trường có giá trị, vì một khoá `undefined` sẽ ghi đè mặc định bằng `undefined`.
 */
export async function addDetailPatient(
  db: DataSource,
  fx: AdminFixtures,
  seed: DetailSeed = {},
): Promise<string> {
  const base: PatientSeed = { hoTen: seed.hoTen ?? 'Nguyễn Văn Thử' };
  if (seed.email !== undefined) base.email = seed.email;
  if (seed.soDienThoai !== undefined) base.soDienThoai = seed.soDienThoai;
  if (seed.trangThai !== undefined) base.trangThai = seed.trangThai;
  const id = await addPatient(fx, base);
  await db.query(
    `UPDATE tai_khoan SET gioi_tinh = ?, ngay_sinh = ?, dia_chi = ?, thoi_diem_tao = COALESCE(?, thoi_diem_tao)
      WHERE tai_khoan_id = ?`,
    [
      seed.gioiTinh ?? null,
      seed.ngaySinh ?? null,
      seed.diaChi ?? null,
      seed.thoiDiemTaoVN ?? null,
      id,
    ],
  );
  if (seed.soLanVangMat !== undefined) {
    await db.query(
      'UPDATE benh_nhan SET so_lan_no_show = ? WHERE tai_khoan_id = ?',
      [seed.soLanVangMat, id],
    );
  }
  return id;
}

/** Thêm MỘT hồ sơ người thân (đang dùng hoặc đã ngừng) trong một giao dịch (id lấy từ `LAST_INSERT_ID()` của cùng kết nối). */
export async function addRelative(
  db: DataSource,
  ownerId: string,
  input: NewRelative,
  active = true,
): Promise<void> {
  const repository = new RelativesRepository();
  await db.transaction(async (em) => {
    const id = await repository.insertRelative(em, ownerId, input);
    if (!active) await repository.deactivateRelative(em, ownerId, id);
  });
}

const FORMER: NewRelative = {
  hoTen: 'Trần Văn Cha',
  moiQuanHe: 'Cha',
  gioiTinh: 'Nam',
  ngaySinh: '1960-12-31',
  soDienThoai: null,
};
const CURRENT: NewRelative = {
  hoTen: 'Nguyễn Thị Con',
  moiQuanHe: 'Con',
  gioiTinh: 'Nu',
  ngaySinh: '2018-03-04',
  soDienThoai: '0911222333',
};

/**
 * Thêm hai người thân cho `ownerId`: người ĐÃ NGỪNG tạo TRƯỚC (id nhỏ hơn), người đang dùng tạo SAU, để thứ tự "đang dùng trước" có thật (xếp theo id thì ngược lại).
 * Trả danh sách mong đợi của `nguoiThan`: đúng sáu khoá, đang dùng trước. Người đang dùng có SĐT, người đã ngừng không (`null`).
 */
export async function addTwoRelatives(
  db: DataSource,
  ownerId: string,
): Promise<PatientDetailRelative[]> {
  await addRelative(db, ownerId, FORMER, false);
  await addRelative(db, ownerId, CURRENT, true);
  return [
    { ...CURRENT, trangThaiHieuLuc: true },
    { ...FORMER, trangThaiHieuLuc: false },
  ];
}

/**
 * Các mã tài khoản mà chi tiết phải trả 404 chung (TC-12): không tồn tại, Lễ tân, Bác sĩ, Quản trị viên (hai phạm vi), Bệnh nhân chưa xác minh và một Bác sĩ có
 * dòng `benh_nhan` HỎNG (chèn tay: khoá ngoại của `benh_nhan` không bắt tài khoản phải là Bệnh nhân). Khoá là nhãn tiếng Việt để in khi đỏ.
 */
export async function addNotFoundBranches(
  db: DataSource,
  fx: AdminFixtures,
): Promise<Record<string, string>> {
  const branch = await fx.branch();
  const dirtyDoctor = (await fx.doctor(branch)).account.taiKhoanId;
  await db.query('INSERT INTO benh_nhan (tai_khoan_id) VALUES (?)', [
    dirtyDoctor,
  ]);
  return {
    'không tồn tại': MISSING_ID,
    'Lễ tân': (await fx.receptionist(branch)).account.taiKhoanId,
    'Bác sĩ': (await fx.doctor(branch)).account.taiKhoanId,
    'Quản trị viên Toàn hệ thống': (await fx.admin()).account.taiKhoanId,
    'Quản trị viên Chi nhánh': (await fx.admin(branch)).account.taiKhoanId,
    'Bệnh nhân chưa xác minh': await addUnverifiedPatient(db, {
      hoTen: 'Chưa Xác Minh',
    }),
    'Bác sĩ có dòng benh_nhan hỏng': dirtyDoctor,
  };
}

/**
 * Thêm một Bệnh nhân đã xác minh với mã tài khoản CHỌN TRƯỚC (SQL thô, chèn cả `benh_nhan`): để thử "mã không có trong log" cần một mã đủ dài và riêng, vì mã nhỏ (3, 7…)
 * trùng với giờ, số tiến trình… trong dòng log. Họ tên, email, SĐT, địa chỉ, ngày sinh do người gọi chọn (dấu vết riêng).
 */
export async function addPatientWithId(
  db: DataSource,
  id: string,
  fields: {
    hoTen: string;
    email: string;
    soDienThoai: string;
    diaChi: string;
    ngaySinh: string;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO tai_khoan (tai_khoan_id, ho_ten, ngay_sinh, so_dien_thoai, dia_chi, email, mat_khau_bam, trang_thai, da_xac_minh_email, loai_tai_khoan)
     VALUES (?, ?, ?, ?, ?, ?, 'x', 'DangHoatDong', TRUE, 'BenhNhan')`,
    [
      id,
      fields.hoTen,
      fields.ngaySinh,
      fields.soDienThoai,
      fields.diaChi,
      fields.email,
    ],
  );
  await db.query('INSERT INTO benh_nhan (tai_khoan_id) VALUES (?)', [id]);
}
