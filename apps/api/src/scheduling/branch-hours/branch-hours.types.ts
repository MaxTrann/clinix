import type { CaLamViec } from '../../admin/entities/enums.js';

export type { CaLamViec };

/** Khoảng trong ngày tính bằng GIÂY từ 00:00 giờ VN (không dùng Date để cộng giờ). */
export interface ShiftRange {
  tuGiay: number;
  denGiay: number;
}

/** Giờ nhận khám của một chi nhánh trong một thứ. Ở chỗ gọi, `null` thay cho BranchDayHours = CHƯA KHAI BÁO (không có dòng). */
export interface BranchDayHours {
  hoatDong: boolean;
  sang: ShiftRange | null;
  chieu: ShiftRange | null;
}

/** Mã lý do của quy tắc 29. */
export type HoursViolation =
  'ChuaKhaiBao' | 'NgayNghi' | 'CaKhongTonTai' | 'NgoaiGioHoatDong';

export type ShiftWindowResult =
  | { ok: true; khoang: ShiftRange }
  | { ok: false; lyDo: Exclude<HoursViolation, 'NgoaiGioHoatDong'> };
