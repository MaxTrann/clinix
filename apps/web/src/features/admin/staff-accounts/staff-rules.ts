import {
  INVALID_LABEL,
  MISSING_LABEL,
  formatBirthDate,
  formatCreatedAt,
  formatStatus,
} from '../account-common/account-format';
import { accountActions, type FieldRow } from '../account-common/account-rules';
import type { AdminScopeKind } from '../account-common/account-types';
import type {
  ActivationLink,
  DependentList,
  StaffAccount,
  StaffRole,
} from './staff-types';

// Quy tắc thuần của màn Nhân sự (admin F8): ai được bấm gì, bộ lọc vai trò theo phạm vi, và các câu chữ ghép từ dữ liệu.
// Chỉ là lớp giao diện: server vẫn kiểm lại mọi thao tác (TK-22), không ai được dựa vào việc ẩn nút.

const ROLE_LABELS: Record<StaffRole, string> = {
  BacSi: 'Bác sĩ',
  LeTan: 'Lễ tân',
  QuanTriVien: 'Quản trị viên',
};

/** Nhãn vai trò; giá trị lạ (kể cả `BenhNhan`, không thuộc màn này) là dấu gạch, không in nguyên giá trị thô. */
export function formatRole(value: string): string {
  return Object.hasOwn(ROLE_LABELS, value)
    ? ROLE_LABELS[value as StaffRole]
    : INVALID_LABEL;
}

export function formatAdminScope(value: string | null | undefined): string {
  if (value === 'ToanHeThong') return 'Toàn hệ thống';
  if (value === 'ChiNhanh') return 'Chi nhánh';
  return INVALID_LABEL;
}

const UNASSIGNED_LABEL = 'Chưa phân công';

/**
 * Chi nhánh của một nhân sự. Chỉ Quản trị viên Toàn hệ thống mới không thuộc chi nhánh nào; hồ sơ thiếu chi nhánh (dữ liệu hỏng) của người khác là
 * "Chưa phân công", không bịa "Toàn hệ thống".
 */
export function formatBranch(
  account: Pick<StaffAccount, 'loaiTaiKhoan' | 'chiNhanh' | 'phamViQuanTri'>,
): string {
  if (account.chiNhanh !== null) return account.chiNhanh.ten;
  if (
    account.loaiTaiKhoan === 'QuanTriVien' &&
    account.phamViQuanTri === 'ToanHeThong'
  )
    return formatAdminScope('ToanHeThong');
  return UNASSIGNED_LABEL;
}

export type RoleFilter = 'all' | StaffRole;

/** Các lựa chọn của ô lọc vai trò. Admin Chi nhánh KHÔNG thấy Quản trị viên nào (Q27, L9) nên không có lựa chọn đó. */
export function roleFilterOptions(
  scope: AdminScopeKind,
): { value: RoleFilter; label: string }[] {
  const roles: StaffRole[] =
    scope === 'ToanHeThong'
      ? ['BacSi', 'LeTan', 'QuanTriVien']
      : ['BacSi', 'LeTan'];
  return [
    { value: 'all', label: 'Tất cả vai trò' },
    ...roles.map((role) => ({ value: role, label: formatRole(role) })),
  ];
}

/**
 * Giá trị `vaiTro` gửi cho `GET /admin/accounts`. KHÔNG BAO GIỜ rỗng: bỏ tham số `vaiTro` là lấy cả Bệnh nhân (màn khác). Chi nhánh không gửi Quản trị viên.
 */
export function rolesToQuery(
  scope: AdminScopeKind,
  filter: RoleFilter,
): StaffRole[] {
  const allowed = roleFilterOptions(scope)
    .map((option) => option.value)
    .filter((value): value is StaffRole => value !== 'all');
  return filter !== 'all' && allowed.includes(filter) ? [filter] : allowed;
}

export interface StaffActions {
  canLock: boolean;
  canUnlock: boolean;
  canResend: boolean;
}

/**
 * Ma trận nút theo PLAN 5.6. Khoá và mở khoá lấy từ `accountActions` của F9 (một bản duy nhất): `ChoKichHoat` không khoá hay mở khoá được (A6);
 * Chi nhánh không thao tác Quản trị viên. "Gửi lại" chỉ cho tài khoản `ChoKichHoat`; Chi nhánh chỉ gửi cho Bác sĩ và Lễ tân (TK-44).
 */
export function staffActions(
  scope: AdminScopeKind,
  account: Pick<StaffAccount, 'loaiTaiKhoan' | 'trangThai'>,
): StaffActions {
  const { canLock, canUnlock } = accountActions(scope, account);
  const reachable =
    scope === 'ToanHeThong' || account.loaiTaiKhoan !== 'QuanTriVien';
  return {
    canLock,
    canUnlock,
    canResend: reachable && account.trangThai === 'ChoKichHoat',
  };
}

export interface LinkDisplay {
  kind: 'valid' | 'expired' | 'none';
  text: string;
}

/**
 * Câu mô tả liên kết kích hoạt đang hiệu lực (PLAN 5.5): trạng thái do SERVER suy ra (`HOP_LE`, `HET_HAN`), web chỉ đổi giờ sang giờ Việt Nam.
 * Không có liên kết, trạng thái lạ hay hạn không đọc được thì coi là chưa có, không bịa một mốc giờ.
 */
export function describeActivationLink(
  link: ActivationLink | null | undefined,
): LinkDisplay {
  const none: LinkDisplay = {
    kind: 'none',
    text: 'Chưa có liên kết kích hoạt còn hiệu lực.',
  };
  if (link === null || link === undefined) return none;
  const when = formatCreatedAt(link.hetHanLuc);
  if (when === INVALID_LABEL || when === MISSING_LABEL) return none;
  if (link.trangThai === 'HOP_LE')
    return {
      kind: 'valid',
      text: `Liên kết kích hoạt còn hiệu lực đến ${when}.`,
    };
  if (link.trangThai === 'HET_HAN')
    return {
      kind: 'expired',
      text: `Liên kết kích hoạt đã hết hạn lúc ${when}.`,
    };
  return none;
}

/**
 * Thời gian chờ của 429 `GUI_LAI_QUA_SOM` (`chiTiet.soGiayCho`, số giây đã làm tròn lên ở server): dưới 60 giây in giây, từ 60 giây in phút làm tròn LÊN.
 * Không phải số dương hữu hạn thì `null`: nơi gọi về đúng câu của PLAN, không in số bịa.
 */
export function formatWait(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return null;
  const seconds = Math.ceil(value);
  return seconds < 60 ? `${seconds} giây` : `${Math.ceil(seconds / 60)} phút`;
}

/** Số mục không có trong danh sách phụ thuộc vì API cắt ở 50 (tổng thật lớn hơn số mục trả về). */
export function hiddenCount(
  list: Pick<DependentList<unknown>, 'tong' | 'muc'>,
): number {
  return Math.max(0, list.tong - list.muc.length);
}

const SHIFT_LABELS: Record<string, string> = {
  CaSang: 'Ca sáng',
  CaChieu: 'Ca chiều',
  CaToi: 'Ca tối',
};

// Chỉ ba trạng thái "đang hoạt động" của lịch hẹn (B18 chỉ liệt kê loại này)
const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  ChoThanhToan: 'Chờ thanh toán',
  DaXacNhan: 'Đã xác nhận',
  DaTiepDon: 'Đã tiếp đón',
};

const known = (table: Record<string, string>, code: string): string =>
  Object.hasOwn(table, code) ? table[code] : INVALID_LABEL;

export function formatShift(code: string): string {
  return known(SHIFT_LABELS, code);
}

export function formatAppointmentStatus(code: string): string {
  return known(APPOINTMENT_STATUS_LABELS, code);
}

const SLOT_TIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):\d{2}$/;

/**
 * Giờ của lịch hẹn `YYYY-MM-DD HH:mm:ss` (B18 trả sẵn GIỜ VIỆT NAM, DATETIME không mang múi giờ) sang `dd/MM/yyyy HH:mm`. KHÔNG đổi múi giờ.
 * Ngày không có thật, giờ ngoài 00 đến 23, phút ngoài 00 đến 59 hay chuỗi rác là dấu gạch.
 */
export function formatSlotTime(value: string): string {
  const match = SLOT_TIME.exec(value);
  if (match === null) return INVALID_LABEL;
  const [, date, hour, minute] = match;
  const day = formatBirthDate(date);
  if (day === INVALID_LABEL || Number(hour) > 23 || Number(minute) > 59)
    return INVALID_LABEL;
  return `${day} ${hour}:${minute}`;
}

/** Ngày tạo ở danh sách: chỉ `dd/MM/yyyy` theo giờ Việt Nam; thiếu hay không đọc được thì giữ nguyên nhãn ("Chưa có", dấu gạch). */
export function formatCreatedDate(value: string | null | undefined): string {
  const full = formatCreatedAt(value);
  return /^\d{2}\/\d{2}\/\d{4} /.test(full) ? full.slice(0, 10) : full;
}

/**
 * Các dòng chi tiết được vẽ ra, theo thứ tự. CHỈ liệt kê từng khoá được phép (không trải `...account`): khoá lạ của API, kể cả địa chỉ, ngày sinh hay thứ gì
 * nhạy cảm, không bao giờ lên màn hình. Chữ tự do (họ tên, email, SĐT) giữ nguyên văn và chỉ được in như văn bản.
 */
export function staffFields(account: StaffAccount): FieldRow[] {
  const rows: FieldRow[] = [
    { id: 'hoTen', label: 'Họ tên', value: account.hoTen },
    { id: 'email', label: 'Email', value: account.email },
    { id: 'soDienThoai', label: 'Số điện thoại', value: account.soDienThoai },
    { id: 'vaiTro', label: 'Vai trò', value: formatRole(account.loaiTaiKhoan) },
  ];
  if (account.loaiTaiKhoan === 'QuanTriVien')
    rows.push({
      id: 'phamVi',
      label: 'Phạm vi',
      value: formatAdminScope(account.phamViQuanTri),
    });
  rows.push(
    { id: 'chiNhanh', label: 'Chi nhánh', value: formatBranch(account) },
    {
      id: 'trangThai',
      label: 'Trạng thái',
      value: formatStatus(account.trangThai),
    },
    {
      id: 'thoiDiemTao',
      label: 'Ngày tạo',
      value: formatCreatedAt(account.thoiDiemTao),
    },
  );
  return rows;
}
