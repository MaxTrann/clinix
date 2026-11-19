import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../../auth/entities/enums.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import type {
  CaLamViec,
  PhamViQuanTri,
  TrangThaiLichHen,
} from '../entities/enums.js';

export type LockAction = 'lock' | 'unlock';

/** Dữ kiện của tài khoản đích, đọc LẠI dưới khoá hàng (nguồn quyết định duy nhất của chính sách). */
export interface LockTarget {
  taiKhoanId: string;
  loaiTaiKhoan: LoaiTaiKhoan;
  trangThai: TrangThaiTaiKhoan;
  /** Chỉ Quản trị viên có; null với ba loại còn lại. */
  phamViQuanTri: PhamViQuanTri | null;
  /** Chi nhánh của Bác sĩ hoặc Lễ tân (hồ sơ con); null với Bệnh nhân, Quản trị viên và hồ sơ con bị thiếu. */
  chiNhanhId: string | null;
}

/** Một Quản trị viên Toàn hệ thống trong tập đã khoá (để đếm "còn ít nhất một đang hoạt động"). */
export interface SystemAdminState {
  taiKhoanId: string;
  trangThai: TrangThaiTaiKhoan;
}

export interface PolicyInput {
  action: LockAction;
  scope: AdminScope;
  actorId: string;
  target: LockTarget;
  /** Tập Quản trị viên Toàn hệ thống đã khoá (gồm cả đích khi đích là Toàn hệ thống); rỗng nếu đích không phải. */
  systemAdmins: readonly SystemAdminState[];
}

export interface DependentAppointment {
  lichHenId: string;
  maLichHen: string;
  /** Giờ Việt Nam, dạng `YYYY-MM-DD HH:mm:ss` (DATETIME của DB không mang múi giờ). */
  thoiGian: string;
  trangThai: TrangThaiLichHen;
}

export interface DependentShift {
  lichLamViecId: string;
  chiNhanhId: string;
  /** `YYYY-MM-DD`. */
  ngay: string;
  ca: CaLamViec;
}

export interface DependentList<T> {
  /** Tổng số thật (không bị cắt ở 50). */
  tong: number;
  /** Tối đa `DEPENDENTS_LIMIT` mục đầu. */
  muc: T[];
}

/** Việc đang phụ thuộc vào Bác sĩ bị khoá; chỉ để người có trách nhiệm bố trí lại, B18 KHÔNG tự xử lý (Q28). */
export interface DoctorDependents {
  lichHen: DependentList<DependentAppointment>;
  caLamViec: DependentList<DependentShift>;
}

export interface LockResponse {
  taiKhoanId: string;
  loaiTaiKhoan: LoaiTaiKhoan;
  trangThai: 'NgungHoatDong';
  soPhienThuHoi: number;
  /** Chỉ có khi đích là Bác sĩ. */
  phuThuoc?: DoctorDependents;
}

export interface UnlockResponse {
  taiKhoanId: string;
  loaiTaiKhoan: LoaiTaiKhoan;
  trangThai: 'DangHoatDong';
}
