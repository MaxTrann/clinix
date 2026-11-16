import { ADMIN_RATING_STATUSES } from '../examination.constants.js';

// Hàm THUẦN của danh sách đánh giá cho Quản trị viên (doctor-exam B7; PLAN 5.8; KDD-02, KDD-18). Không DB, không đồng hồ.

export type AdminRatingStatus = (typeof ADMIN_RATING_STATUSES)[number];

/** Số đánh giá theo trạng thái hiển thị: `demTheoTrangThai` của phản hồi. */
export interface AdminRatingCounts {
  HienThi: number;
  DaAn: number;
}

const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;

/**
 * Nhận xét ở danh sách: tối đa `max` đơn vị UTF-16 (cùng đơn vị với `string.length` của bộ đếm và trần 1.000 của B6). Điểm cắt rơi GIỮA một cặp thay thế (emoji) thì lùi một đơn vị
 * để không để lại nửa ký tự. Không thêm "…" (hợp đồng giữ đúng tám khoá; giao diện tự quyết cách hiển thị). `null` giữ `null`.
 */
export function previewComment(
  text: string | null,
  max: number,
): string | null {
  if (text === null || text.length <= max) return text;
  const cutInsidePair =
    isHighSurrogate(text.charCodeAt(max - 1)) &&
    isLowSurrogate(text.charCodeAt(max));
  return text.slice(0, cutInsidePair ? max - 1 : max);
}

/**
 * Tổng số dòng khớp bộ lọc ĐỂ PHÂN TRANG: suy từ câu đếm theo trạng thái (đã áp mọi lọc trừ `trangThai`), không cần câu `COUNT(*)` thứ hai.
 * `trangThai` vắng ⇒ cả hai trạng thái; có ⇒ chỉ trạng thái đó.
 */
export function totalOf(
  counts: AdminRatingCounts,
  trangThai: AdminRatingStatus | undefined,
): number {
  return trangThai === undefined
    ? counts.HienThi + counts.DaAn
    : counts[trangThai];
}
