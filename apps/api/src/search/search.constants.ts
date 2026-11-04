// Hằng số dùng chung của module search (PLAN search mục 5.1, 5.8).

/** Độ dài tối đa của từ khoá tìm kiếm `q` (TCBS/TCCN: 0–100 ký tự). */
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** Mã lỗi của MỘT trường trong loi[{truong, ma}] (PLAN 5.8). */
export const SEARCH_ERROR_CODES = {
  INVALID_KEYWORD: 'TU_KHOA_KHONG_HOP_LE',
  /** Mã lỗi cấp trên của 400 do bộ lọc sai (id lọc sai dạng, về sau giá/điểm/sắp xếp) — PLAN 5.8. */
  INVALID_FILTER: 'BO_LOC_KHONG_HOP_LE',
  /** Mã của MỘT trường lọc là id nhưng không phải số nguyên dương hợp lệ. */
  INVALID_FILTER_ID: 'ID_LOC_KHONG_HOP_LE',
} as const;

/** Mọi route của module nằm dưới tiền tố này (Q22); tiền tố `/api` do proxy thêm. */
export const PUBLIC_ROUTE_PREFIX = 'public';
