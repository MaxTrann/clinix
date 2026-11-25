import {
  DEFAULT_TITLE,
  baseCodeOf,
  findCatalogEntry,
} from '../catalog/notification-catalog.js';
import type {
  NotificationItem,
  NotificationLink,
} from './notification-center.dto.js';
import type { NotificationRow } from './notification-center.repository.js';

// Ghép một hàng `thong_bao` với danh mục sự kiện thành mục trả về (notification B2; PLAN 5.4, 5.3). Hàm THUẦN, không đọc DB.

/**
 * Liên kết theo thứ tự (PLAN 5.4): thông báo gắn lịch hẹn ⇒ `{ kieu: 'LichHen', maLichHen }` (mã, không id: nếp patient Q13);
 * không gắn lịch ⇒ kiểu của danh mục (`Vi`, `NghiPhep`, `ThayDoiChiNhanh`); danh mục ghi `LichHen` mà không có lịch, hay mã lạ ⇒ `null`.
 */
export function buildLink(
  loaiSuKien: string,
  maLichHen: string | null,
): NotificationLink | null {
  if (maLichHen !== null) return { kieu: 'LichHen', maLichHen };
  const kieu = findCatalogEntry(loaiSuKien)?.lienKet ?? null;
  if (kieu === null || kieu === 'LichHen') return null;
  return { kieu };
}

/** Mã lạ không làm lỗi (TTB-11): tiêu đề mặc định, nhóm `null`, không liên kết. */
export function toNotificationItem(row: NotificationRow): NotificationItem {
  const entry = findCatalogEntry(row.loai);
  return {
    id: row.id,
    loai: baseCodeOf(row.loai),
    nhom: entry?.nhom ?? null,
    tieuDe: entry?.tieuDe ?? DEFAULT_TITLE,
    noiDung: row.noiDung,
    daDoc: Number(row.daDoc) === 1,
    thoiDiemTao: row.thoiDiemTao.toISOString(),
    lienKet: buildLink(row.loai, row.maLichHen),
  };
}
