// Hằng của scope dashboard (PLAN dashboard 5.5, 5.8; Q7). Mã lỗi nằm trong `loi[].ma` của 400 `DU_LIEU_KHONG_HOP_LE`, web chọn câu theo mã.

/** Khoảng mặc định khi không gửi ngày: 30 ngày tính cả hôm nay (Q7). */
export const DEFAULT_RANGE_DAYS = 30;

/** Khoảng dài nhất được phép, tính cả hai đầu (Q7). */
export const MAX_RANGE_DAYS = 366;

/** Biểu đồ xu hướng: khoảng tới 62 ngày thì một điểm mỗi ngày, dài hơn thì một điểm mỗi tuần (Q5). */
export const MAX_DAILY_TREND_DAYS = 62;

/**
 * Mã của một trường bộ lọc (PLAN 5.8). `KHOANG_NGAY_QUA_DAI` là mã mới của PLAN; `CHI_NHANH_KHONG_HOP_LE` (id chi nhánh sai dạng) là `[đề xuất]`
 * của B1 vì PLAN chỉ ghi "chiNhanhId sai dạng ⇒ 400".
 */
export const DASHBOARD_FIELD_ERROR_CODES = {
  INVALID_DATE: 'NGAY_KHONG_HOP_LE',
  INVALID_RANGE: 'KHOANG_NGAY_KHONG_HOP_LE',
  RANGE_TOO_LONG: 'KHOANG_NGAY_QUA_DAI',
  INVALID_BRANCH: 'CHI_NHANH_KHONG_HOP_LE',
} as const;
