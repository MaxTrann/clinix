// Kiểu dữ liệu của API Trung tâm thông báo (notification B2, PLAN 5.4). Id BIGINT là chuỗi; `thoiDiemTao` là ISO UTC (nơi hiển thị đổi sang giờ Việt Nam).

export const READ_FILTERS = ['tat-ca', 'chua-doc', 'da-doc'] as const;
export type ReadFilter = (typeof READ_FILTERS)[number];

export const NOTIFICATION_GROUPS = [
  'LichHen',
  'DoiLich',
  'NghiPhep',
  'Vi',
  'ChiNhanh',
  // chat B6, F1: tin nhắn mới
  'TinNhan',
] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export const LINK_KINDS = [
  'LichHen',
  'Vi',
  'NghiPhep',
  'ThayDoiChiNhanh',
  // chat B6, F1: mở hội thoại (id công khai của chat; quyền xem do API chat kiểm lại)
  'HoiThoai',
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export type NotificationLink =
  | { kieu: 'LichHen'; maLichHen: string }
  | { kieu: 'HoiThoai'; hoiThoaiId: string }
  | { kieu: Exclude<LinkKind, 'LichHen' | 'HoiThoai'> };

export interface NotificationItem {
  id: string;
  loai: string;
  /** `null` khi mã sự kiện không có trong danh mục (B2 trả `nhom: null`). */
  nhom: NotificationGroup | null;
  tieuDe: string;
  noiDung: string;
  daDoc: boolean;
  thoiDiemTao: string;
  lienKet: NotificationLink | null;
}

export interface NotificationPage {
  items: NotificationItem[];
  total: number;
  page: number;
  pageSize: number;
  soChuaDoc: number;
}

export interface MarkReadResult {
  id: string;
  daDoc: true;
  soChuaDoc: number;
}

export interface MarkAllReadResult {
  daDanhDau: number;
  soChuaDoc: number;
}
