import {
  formatBirthDate,
  formatCreatedAt,
  formatEmailVerified,
  formatGender,
  formatNoShowCount,
  formatNoShowLock,
  formatStatus,
  formatText,
} from './account-format';
import type {
  AccountActionFacts,
  AccountRole,
  AdminScopeKind,
  PatientAccount,
} from './account-types';

// Quy tắc thuần của màn tài khoản (admin F9, dùng lại ở F8): ai được bấm gì, trường nào được hiện, và no-show kế tiếp có khoá lại ngay không.
// Chỉ là lớp giao diện: server vẫn kiểm lại mọi thao tác (TK-15, TK-22, TK-33), không ai được dựa vào việc ẩn nút.

export interface AccountActions {
  canLock: boolean;
  canUnlock: boolean;
  canUnlockNoShow: boolean;
}

const NONE: AccountActions = {
  canLock: false,
  canUnlock: false,
  canUnlockNoShow: false,
};

// Bác sĩ và Lễ tân: cả hai phạm vi (Chi nhánh chỉ thấy người của chi nhánh mình). Bệnh nhân và Quản trị viên: chỉ Toàn hệ thống.
function canManageLock(scope: AdminScopeKind, role: AccountRole): boolean {
  if (role === 'BacSi' || role === 'LeTan') return true;
  return scope === 'ToanHeThong';
}

/**
 * Ma trận nút theo PLAN 5.6 (phạm vi × loại × trạng thái × cờ no-show).
 * - Tài khoản `ChoKichHoat` không khoá hay mở khoá được (A6): dùng "Gửi lại liên kết kích hoạt" (F8, B20).
 * - Admin Chi nhánh chỉ khoá Bác sĩ và Lễ tân (của chi nhánh mình: server chỉ cho thấy đúng những người đó); Bệnh nhân và Quản trị viên thì KHÔNG.
 * - "Mở khoá no-show" chỉ Toàn hệ thống, chỉ Bệnh nhân, CHỈ khi cờ đang bật (Q31). Cờ `null` (chưa có hồ sơ bệnh nhân) KHÔNG phải bật.
 */
export function accountActions(
  scope: AdminScopeKind,
  account: AccountActionFacts,
): AccountActions {
  const system = scope === 'ToanHeThong';
  if (!canManageLock(scope, account.loaiTaiKhoan)) return NONE;
  return {
    canLock: account.trangThai === 'DangHoatDong',
    canUnlock: account.trangThai === 'NgungHoatDong',
    canUnlockNoShow:
      system &&
      account.loaiTaiKhoan === 'BenhNhan' &&
      account.khoaDatLichDoNoShow === true,
  };
}

export interface FieldRow {
  id: string;
  label: string;
  value: string;
}

/** Sáu trường hành chính Admin Chi nhánh được xem ở Bệnh nhân (Q26), đúng thứ tự hiển thị. */
export const BRANCH_PATIENT_FIELD_IDS = [
  'hoTen',
  'email',
  'soDienThoai',
  'ngaySinh',
  'gioiTinh',
  'trangThai',
] as const;

/**
 * Các dòng chi tiết được vẽ ra, THEO PHẠM VI. Admin Chi nhánh nhận đúng sáu dòng (Q26) và hàm này không bao giờ đọc `diaChi`, `thoiDiemTao`,
 * `daXacMinhEmail`, `khoaDatLichDoNoShow`, `soLanNoShow` của họ, kể cả khi API (hay một mock trong test) lỡ trả thừa.
 */
export function visibleFields(
  scope: AdminScopeKind,
  account: PatientAccount,
): FieldRow[] {
  const base: FieldRow[] = [
    { id: 'hoTen', label: 'Họ tên', value: formatText(account.hoTen) },
    { id: 'email', label: 'Email', value: formatText(account.email) },
    {
      id: 'soDienThoai',
      label: 'Số điện thoại',
      value: formatText(account.soDienThoai),
    },
    {
      id: 'ngaySinh',
      label: 'Ngày sinh',
      value: formatBirthDate(account.ngaySinh),
    },
    {
      id: 'gioiTinh',
      label: 'Giới tính',
      value: formatGender(account.gioiTinh),
    },
    {
      id: 'trangThai',
      label: 'Trạng thái',
      value: formatStatus(account.trangThai),
    },
  ];
  if (scope !== 'ToanHeThong') return base;
  return [
    ...base,
    { id: 'diaChi', label: 'Địa chỉ', value: formatText(account.diaChi) },
    {
      id: 'daXacMinhEmail',
      label: 'Xác minh email',
      value: formatEmailVerified(account.daXacMinhEmail),
    },
    {
      id: 'thoiDiemTao',
      label: 'Ngày tạo',
      value: formatCreatedAt(account.thoiDiemTao),
    },
    {
      id: 'khoaNoShow',
      label: 'Khoá đặt lịch do no-show',
      value: formatNoShowLock(account.khoaDatLichDoNoShow),
    },
    {
      id: 'soLanNoShow',
      label: 'Số lần no-show',
      value: formatNoShowCount(account.soLanNoShow),
    },
  ];
}

export type RelockOutlook =
  | { kind: 'unknown' }
  | { kind: 'relock'; nguong: number }
  | { kind: 'below'; nguong: number };

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * No-show kế tiếp có khoá đặt lịch lại ngay không? Mã booking (`mark-no-show.ts`) cộng một TRƯỚC rồi so `soLan >= nguongNoShow`, nên khoá lại khi
 * `S + 1 >= N`. Ngưỡng chưa biết (`null`, chưa cấu hình, ngoài miền 1 đến 10 của PLAN 5.7, hay không phải số nguyên) thì KHÔNG đoán: trả `unknown`.
 */
export function relockOutlook(
  soLan: number | null | undefined,
  nguong: number | null | undefined,
): RelockOutlook {
  if (!isCount(soLan) || !isCount(nguong) || nguong < 1)
    return { kind: 'unknown' };
  return soLan + 1 >= nguong
    ? { kind: 'relock', nguong }
    : { kind: 'below', nguong };
}
