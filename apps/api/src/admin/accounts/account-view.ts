import type { MaXacThuc } from '../../auth/entities/ma-xac-thuc.entity.js';
import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../../auth/entities/enums.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { deriveActivationLinkState } from '../staff-activation/activation-link-rules.js';
import type { PhamViQuanTri } from '../entities/enums.js';

// ---- Hàng thô do repository trả: tập khoá CỐ ĐỊNH (ACCOUNT_ROW_KEYS), không có cột bí mật nào ----

/** Mọi khoá của `AccountRow`, theo đúng thứ tự `SELECT`. Test so BẰNG tập này để cột lạ (ví dụ băm mật khẩu) không lọt vào. */
export const ACCOUNT_ROW_KEYS = [
  'taiKhoanId',
  'loaiTaiKhoan',
  'hoTen',
  'email',
  'soDienThoai',
  'ngaySinh',
  'gioiTinh',
  'diaChi',
  'trangThai',
  'daXacMinhEmail',
  'thoiDiemTao',
  'khoaDatLichDoNoShow',
  'soLanNoShow',
  'phamViQuanTri',
  'chiNhanhId',
  'chiNhanhTen',
] as const;

export interface AccountRow {
  taiKhoanId: string;
  loaiTaiKhoan: LoaiTaiKhoan;
  hoTen: string;
  email: string;
  soDienThoai: string;
  /** `YYYY-MM-DD` (đã `DATE_FORMAT` ở SQL, không phụ thuộc cách driver trả cột `date`). */
  ngaySinh: string | null;
  gioiTinh: string | null;
  diaChi: string | null;
  trangThai: TrangThaiTaiKhoan;
  daXacMinhEmail: number | boolean;
  thoiDiemTao: Date;
  /** NULL khi không có dòng `benh_nhan` (nhân sự, hoặc Bệnh nhân chưa xác minh OTP). */
  khoaDatLichDoNoShow: number | boolean | null;
  soLanNoShow: number | string | null;
  /** Chỉ có với Quản trị viên. */
  phamViQuanTri: PhamViQuanTri | null;
  /** Chi nhánh của Bác sĩ, Lễ tân, Quản trị viên phạm vi Chi nhánh; NULL với còn lại. */
  chiNhanhId: string | null;
  chiNhanhTen: string | null;
}

// ---- Phản hồi theo (vai người xem × loại tài khoản). PLAN 5.6, Q26, Q27; bảng khoá ở TRACKING admin mục 9A.3 ----

export interface BranchRef {
  chiNhanhId: string;
  ten: string;
}

/** Admin Chi nhánh xem Bệnh nhân (Q26): sáu trường hành chính + hai khoá kỹ thuật. KHÔNG địa chỉ, thời điểm tạo, no-show. */
export interface PatientBranchView {
  taiKhoanId: string;
  loaiTaiKhoan: 'BenhNhan';
  hoTen: string;
  email: string;
  soDienThoai: string;
  ngaySinh: string | null;
  gioiTinh: string | null;
  trangThai: TrangThaiTaiKhoan;
}

/** Admin Toàn hệ thống xem Bệnh nhân: đủ hồ sơ hành chính; không ví, hồ sơ khám, ảnh. */
export interface PatientSystemView extends PatientBranchView {
  diaChi: string | null;
  daXacMinhEmail: boolean;
  thoiDiemTao: Date;
  /** `null` khi chưa có dòng `benh_nhan` (chưa xác minh OTP). */
  khoaDatLichDoNoShow: boolean | null;
  soLanNoShow: number | null;
}

export interface StaffView {
  taiKhoanId: string;
  loaiTaiKhoan: 'BacSi' | 'LeTan';
  hoTen: string;
  email: string;
  soDienThoai: string;
  ngaySinh: string | null;
  gioiTinh: string | null;
  diaChi: string | null;
  trangThai: TrangThaiTaiKhoan;
  thoiDiemTao: Date;
  chiNhanh: BranchRef | null;
}

/** Chỉ Toàn hệ thống thấy Quản trị viên. `chiNhanh` là `null` với phạm vi Toàn hệ thống. */
export interface AdminUserView extends Omit<StaffView, 'loaiTaiKhoan'> {
  loaiTaiKhoan: 'QuanTriVien';
  phamViQuanTri: PhamViQuanTri | null;
}

export type AccountView =
  PatientBranchView | PatientSystemView | StaffView | AdminUserView;

/**
 * Liên kết kích hoạt ĐANG HIỆU LỰC của nhân sự chờ kích hoạt (PLAN 5.5): chỉ trạng thái dẫn xuất và hạn.
 * KHÔNG có id mã xác thực, băm hay token.
 */
export interface ActivationLinkView {
  trangThai: 'HOP_LE' | 'HET_HAN';
  hetHanLuc: Date;
}

/** Chi tiết = đúng hình dạng danh sách; nhân sự có thêm `lienKetKichHoat` (null nếu không có liên kết đang hiệu lực). */
export type AccountDetail =
  | PatientBranchView
  | PatientSystemView
  | ((StaffView | AdminUserView) & {
      lienKetKichHoat: ActivationLinkView | null;
    });

export type ActivationLinkFacts = Pick<
  MaXacThuc,
  'daDungLuc' | 'daGuiLuc' | 'thuHoiLuc' | 'hetHanLuc'
>;

const toBoolean = (value: number | boolean): boolean => Number(value) === 1;
const toBooleanOrNull = (value: number | boolean | null): boolean | null =>
  value === null ? null : toBoolean(value);

function branchOf(row: AccountRow): BranchRef | null {
  return row.chiNhanhId !== null && row.chiNhanhTen !== null
    ? { chiNhanhId: row.chiNhanhId, ten: row.chiNhanhTen }
    : null;
}

// Mỗi hàm dưới đây LIỆT KÊ từng khoá được phép (danh sách cho phép), không bao giờ trải `...row`.
function patientForBranch(row: AccountRow): PatientBranchView {
  return {
    taiKhoanId: row.taiKhoanId,
    loaiTaiKhoan: 'BenhNhan',
    hoTen: row.hoTen,
    email: row.email,
    soDienThoai: row.soDienThoai,
    ngaySinh: row.ngaySinh,
    gioiTinh: row.gioiTinh,
    trangThai: row.trangThai,
  };
}

function patientForSystem(row: AccountRow): PatientSystemView {
  return {
    ...patientForBranch(row),
    diaChi: row.diaChi,
    daXacMinhEmail: toBoolean(row.daXacMinhEmail),
    thoiDiemTao: row.thoiDiemTao,
    khoaDatLichDoNoShow: toBooleanOrNull(row.khoaDatLichDoNoShow),
    soLanNoShow: row.soLanNoShow === null ? null : Number(row.soLanNoShow),
  };
}

// Các khoá chung của nhân sự (Bác sĩ, Lễ tân, Quản trị viên), chưa gồm `loaiTaiKhoan`.
function staffFields(row: AccountRow) {
  return {
    taiKhoanId: row.taiKhoanId,
    hoTen: row.hoTen,
    email: row.email,
    soDienThoai: row.soDienThoai,
    ngaySinh: row.ngaySinh,
    gioiTinh: row.gioiTinh,
    diaChi: row.diaChi,
    trangThai: row.trangThai,
    thoiDiemTao: row.thoiDiemTao,
    chiNhanh: branchOf(row),
  };
}

function staff(row: AccountRow, loai: 'BacSi' | 'LeTan'): StaffView {
  return { ...staffFields(row), loaiTaiKhoan: loai };
}

function adminUser(row: AccountRow): AdminUserView {
  return {
    ...staffFields(row),
    loaiTaiKhoan: 'QuanTriVien',
    phamViQuanTri: row.phamViQuanTri,
  };
}

/**
 * Hàng DB → phản hồi theo vai người xem. Admin Chi nhánh KHÔNG BAO GIỜ nhận hàng Quản trị viên (Q27): SQL đã loại,
 * hàm này ném lỗi nếu lỡ nhận để một lỗi SQL sau này không biến thành lộ dữ liệu (đóng mặc định).
 */
export function toAccountView(scope: AdminScope, row: AccountRow): AccountView {
  switch (row.loaiTaiKhoan) {
    case 'BenhNhan':
      return scope.kind === 'ToanHeThong'
        ? patientForSystem(row)
        : patientForBranch(row);
    case 'BacSi':
    case 'LeTan':
      return staff(row, row.loaiTaiKhoan);
    case 'QuanTriVien':
      if (scope.kind !== 'ToanHeThong')
        throw new Error('Admin Chi nhánh không được thấy Quản trị viên');
      return adminUser(row);
  }
}

export function toAccountDetail(
  scope: AdminScope,
  row: AccountRow,
  link: ActivationLinkView | null,
): AccountDetail {
  const view = toAccountView(scope, row);
  if (view.loaiTaiKhoan === 'BenhNhan') return view;
  return { ...view, lienKetKichHoat: link };
}

/** Chỉ hai trạng thái có nghĩa với liên kết "đang hiệu lực" (đã gửi, chưa thu hồi, chưa dùng): còn hạn hoặc hết hạn. */
export function toActivationLinkView(
  facts: ActivationLinkFacts,
  now: Date,
): ActivationLinkView | null {
  const state = deriveActivationLinkState(facts, now);
  return state === 'HOP_LE' || state === 'HET_HAN'
    ? { trangThai: state, hetHanLuc: facts.hetHanLuc }
    : null;
}
