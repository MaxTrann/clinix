// Hằng số dùng chung của module search (PLAN search mục 5.1, 5.8).

/** Độ dài tối đa của từ khoá tìm kiếm `q` (TCBS/TCCN: 0–100 ký tự). */
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** Số gợi ý tối đa cho MỖI loại ở ô tìm tổng (Q20). */
export const SUGGESTIONS_PER_GROUP = 5;

/** Mã lỗi của MỘT trường trong loi[{truong, ma}] (PLAN 5.8). */
export const SEARCH_ERROR_CODES = {
  INVALID_KEYWORD: 'TU_KHOA_KHONG_HOP_LE',
  /** Mã lỗi cấp trên của 400 do bộ lọc sai (id lọc sai dạng, về sau giá/điểm/sắp xếp) — PLAN 5.8. */
  INVALID_FILTER: 'BO_LOC_KHONG_HOP_LE',
  /** Mã của MỘT trường lọc là id nhưng không phải số nguyên dương hợp lệ. */
  INVALID_FILTER_ID: 'ID_LOC_KHONG_HOP_LE',
  /** `giaTu`/`giaDen` không phải số nguyên đồng ≥ 0 (Q12). */
  INVALID_PRICE: 'GIA_KHONG_HOP_LE',
  /** `giaTu` lớn hơn `giaDen` (báo ở trường `giaTu`). */
  INVALID_PRICE_RANGE: 'KHOANG_GIA_KHONG_HOP_LE',
  /** `diemTu` ngoài khoảng 0,1–5,0 hoặc nhiều hơn 1 chữ số thập phân (Q12). */
  INVALID_RATING: 'DIEM_KHONG_HOP_LE',
  /** `sapXep` ngoài danh sách trắng. */
  INVALID_SORT: 'SAP_XEP_KHONG_HOP_LE',
  /** `bacSiIds` của API khung giờ thiếu, rỗng hoặc có phần tử không phải id BIGINT dương. */
  INVALID_DOCTOR_IDS: 'DANH_SACH_BAC_SI_KHONG_HOP_LE',
  /** Quá `SLOT_MAX_DOCTORS` id KHÁC NHAU trong một lời gọi khung giờ. */
  TOO_MANY_DOCTORS: 'QUA_NHIEU_BAC_SI',
  /** `ngay` của API khung giờ thiếu, sai dạng `YYYY-MM-DD` hoặc không phải ngày có thật. */
  INVALID_DATE: 'NGAY_KHONG_HOP_LE',
  /** `ngay` đúng dạng nhưng ngoài `[hôm nay, hôm nay + SLOT_WINDOW_DAYS - 1]` giờ Việt Nam. */
  DATE_OUT_OF_RANGE: 'NGAY_NGOAI_KHOANG',
} as const;

/** Cửa sổ ngày của API khung giờ công khai: hôm nay đến hôm nay + 6 (dải 7 ngày ở Figma). Chỉ là giới hạn HIỂN THỊ, KHÔNG phải giới hạn đặt trước (quy tắc 38). */
export const SLOT_WINDOW_DAYS = 7;

/** Số bác sĩ KHÁC NHAU tối đa mỗi lời gọi khung giờ = `pageSize` lớn nhất của danh sách công khai (web gửi id của MỘT trang); có ca khoá hai số này bằng nhau (KGC-16). */
export const SLOT_MAX_DOCTORS = 100;

/** Mọi route của module nằm dưới tiền tố này (Q22); tiền tố `/api` do proxy thêm. */
export const PUBLIC_ROUTE_PREFIX = 'public';
