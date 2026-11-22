import type {
  AccountStatus,
  BlockingList,
  DoctorDegree,
  DoctorTitle,
} from './doctor-profile-types';

// Chữ hiển thị của màn hồ sơ bác sĩ (admin F7). Chức danh theo Figma 535:2, 536:2 ("ThS.BS.", "BS.CKII"…).
// Nhãn học vị và "Chờ kích hoạt" là [đề xuất] (Trung chốt 22/11/2026): Figma chưa có.

export const TITLE_LABELS: Record<DoctorTitle, string> = {
  BS: 'BS.',
  BS_CKI: 'BS.CKI',
  BS_CKII: 'BS.CKII',
  ThS_BS: 'ThS.BS.',
  TS_BS: 'TS.BS.',
  PGS_TS_BS: 'PGS.TS.BS.',
  GS_TS_BS: 'GS.TS.BS.',
};

export const DEGREE_LABELS: Record<DoctorDegree, string> = {
  BS: 'Bác sĩ',
  ThS: 'Thạc sĩ',
  TS: 'Tiến sĩ',
  PGS: 'Phó giáo sư',
  GS: 'Giáo sư',
};

/**
 * Học vị đi kèm từng chức danh (Q20; trùng CHECK `chk_bac_si_chuc_danh_hoc_vi` và quy tắc của API B15/B13). Dùng để ĐIỀN SẴN học vị khi đổi chức danh
 * và báo lỗi sớm; server vẫn kiểm lại.
 */
export const DEGREE_OF_TITLE: Record<DoctorTitle, DoctorDegree> = {
  BS: 'BS',
  BS_CKI: 'BS',
  BS_CKII: 'BS',
  ThS_BS: 'ThS',
  TS_BS: 'TS',
  PGS_TS_BS: 'PGS',
  GS_TS_BS: 'GS',
};

/** "ThS.BS. Nguyễn Minh Anh" như cột "Tên bác sĩ" của Figma. */
export function displayName(title: DoctorTitle, hoTen: string): string {
  return `${TITLE_LABELS[title]} ${hoTen}`;
}

/** Nhãn ngắn ở danh sách ("Hoạt động") và nhãn đầy đủ ở panel ("Đang hoạt động"). */
export function statusLabel(status: AccountStatus, long = false): string {
  if (status === 'DangHoatDong') return long ? 'Đang hoạt động' : 'Hoạt động';
  if (status === 'NgungHoatDong') return 'Vô hiệu';
  return 'Chờ kích hoạt';
}

/** 'YYYY-MM-DD' ⇒ 'dd/MM/yyyy'; `null` ⇒ "—". */
export function formatDate(value: string | null): string {
  if (value === null) return '—';
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

/** 'YYYY-MM-DD HH:mm:ss' ⇒ 'HH:mm dd/MM/yyyy' (lịch hẹn trong danh sách chặn). */
export function formatDateTime(value: string): string {
  const [date = '', time = ''] = value.split(' ');
  return `${time.slice(0, 5)} ${formatDate(date)}`;
}

/** Chữ cái đầu của hai từ cuối họ tên, cho ảnh đại diện thay thế ("Nguyễn Minh Anh" ⇒ "MA"). */
export function initialsOf(hoTen: string): string {
  const words = hoTen.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(-2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export const SHIFT_LABELS: Record<string, string> = {
  CaSang: 'Ca sáng',
  CaChieu: 'Ca chiều',
};

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  ChoThanhToan: 'Chờ thanh toán',
  DaXacNhan: 'Đã xác nhận',
  DaTiepDon: 'Đã tiếp đón',
};

/** Đọc `chiTiet` của 409 chặn; sai dạng ⇒ `null` (giao diện vẫn hiện câu lỗi, chỉ không có danh sách). */
export function parseBlockingList(value: unknown): BlockingList | null {
  if (typeof value !== 'object' || value === null) return null;
  const { lichHen, ca } = value as Partial<BlockingList>;
  const valid = (part: unknown): boolean =>
    typeof part === 'object' &&
    part !== null &&
    Array.isArray((part as { items?: unknown }).items) &&
    typeof (part as { tong?: unknown }).tong === 'number';
  return valid(lichHen) && valid(ca) ? (value as BlockingList) : null;
}
