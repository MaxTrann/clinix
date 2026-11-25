// Mã lỗi, mã sự kiện thông báo và giới hạn của phần khám bệnh (doctor-exam; PLAN 5.2, 5.12, 5.14; TRACKING 9.2). CHỈ hằng, không logic.
// Frontend chọn thông báo theo MÃ, không theo câu chữ. Mã đã có ở nơi khác (KHONG_TIM_THAY, KHONG_DU_QUYEN, DU_LIEU_KHONG_HOP_LE, TRUONG_KHONG_DUOC_PHEP,
// CHUYEN_TRANG_THAI_KHONG_HOP_LE, HE_THONG_DANG_BAN) KHÔNG khai lại ở đây: import từ `common/errors` và `appointments.constants` khi cần.

// Mã nghiệp vụ riêng của phần khám bệnh (HTTP 409 theo PLAN 5.14; trạng thái HTTP gắn ở service của từng task B).
export const EXAM_ERROR_CODES = {
  /** Ghi hồ sơ khi lịch không ở `DaTiepDon` hay `HoanThanh` (HSK, B2). */
  RECORD_NOT_WRITABLE: 'KHONG_THE_GHI_HO_SO_KHAM',
  /** Sửa chồng: `capNhatLanCuoi` bác sĩ đã thấy khác bản hiện có (HSK, B2). */
  RECORD_CHANGED: 'HO_SO_KHAM_DA_THAY_DOI',
  /** Đánh giá khi lịch chưa `HoanThanh` (DGB, B6). */
  NOT_COMPLETED: 'LICH_HEN_CHUA_HOAN_THANH',
  /** Đánh giá lần hai cùng một lịch (UNIQUE `lich_hen_id`; DGB, B6). */
  ALREADY_RATED: 'DA_DANH_GIA',
  /** Ẩn đánh giá đã ẩn (KDD, B8). */
  RATING_ALREADY_HIDDEN: 'DANH_GIA_DA_AN',
} as const;

// Mã của MỘT trường dữ liệu vào: `ma` trong loi[{truong, ma}] của 400 DU_LIEU_KHONG_HOP_LE (PLAN 5.14). Một số mã (NGAY_KHONG_HOP_LE, LY_DO_BAT_BUOC) cũng có ở module khác với cùng nghĩa.
export const EXAM_FIELD_ERROR_CODES = {
  REQUIRED: 'BAT_BUOC',
  TOO_LONG: 'QUA_DAI',
  INVALID_DATE: 'NGAY_KHONG_HOP_LE',
  /** Nội dung một trường chữ của hồ sơ có dạng bí mật mà bộ che của `audit/` sẽ đổi (`Cookie: …`, `otp: …`, `token=…`, 64 hex…): chặn TRƯỚC giao dịch (HSK-23; Đại 15/11/2026 "Chặn trước bằng lỗi 400"). */
  CONTENT_REJECTED: 'NOI_DUNG_KHONG_HOP_LE',
  RATING_REQUIRED: 'SO_SAO_BAT_BUOC',
  RATING_INVALID: 'SO_SAO_KHONG_HOP_LE',
  HIDE_REASON_REQUIRED: 'LY_DO_BAT_BUOC',
  HIDE_REASON_TOO_SHORT: 'LY_DO_QUA_NGAN',
  HIDE_REASON_TOO_LONG: 'LY_DO_QUA_DAI',
} as const;

// Sự kiện của `thong_bao.loai_su_kien` (varchar 100). `[đề xuất]` Q17. Từ notification B4 loại này CÓ thư: booking giữ bản viết bằng chữ ở `EXAM_MAIL_EVENTS` (`notifications.constants.ts`).
export const EXAM_NOTIFICATION_EVENTS = {
  COMPLETED: 'LichHenHoanThanh',
} as const;

// Giới hạn CHẮC (schema): CHECK `chk_danh_gia_so_sao`, `thong_bao.noi_dung` varchar(500), `danh_gia_bac_si.ly_do_an` varchar(255).
export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const NOTIFICATION_MAX_LENGTH = 500;
export const HIDE_REASON_MAX_LENGTH = 255;

// Giới hạn `[đề xuất]`, CHỜ câu hỏi nhóm (TRACKING 3.1); đơn vị UTF-16 (`string.length`) như bộ đếm của web. Đổi giá trị ở đây là đổi cho cả hệ thống.
/** Mỗi trường chữ của hồ sơ khám: 1 đến 2.000 (Q2). */
export const EXAM_TEXT_MAX_LENGTH = 2000;
/** Ngày tái khám dự kiến không quá ngày khám + 365 ngày (Q2). */
export const FOLLOW_UP_MAX_DAYS = 365;
/** Nhận xét đánh giá tối đa 1.000, tuỳ chọn (Q7; lệch Figma `423:2`, L1). */
export const RATING_COMMENT_MAX_LENGTH = 1000;
/** Lý do ẩn đánh giá tối thiểu 10 (Q8; DB không có mức tối thiểu). */
export const HIDE_REASON_MIN_LENGTH = 10;

// Danh sách hồ sơ khám của Bệnh nhân (B4; PLAN 5.6). `PageQueryDto` cho `pageSize` tới 100 nên B4 dùng lớp query riêng với trần 50; miền `nam` `[đề xuất]` (chống năm vô lý, TRACKING 15.7 câu (f)).
export const EXAM_LIST_DEFAULT_PAGE_SIZE = 20;
export const EXAM_LIST_MAX_PAGE_SIZE = 50;
export const EXAM_LIST_YEAR_MIN = 2000;
export const EXAM_LIST_YEAR_MAX = 2100;

// Danh sách và chi tiết đánh giá cho Quản trị viên (B7; PLAN 5.8). Trạng thái hiển thị suy từ `danh_gia_bac_si.bi_an` (HienThi = 0, DaAn = 1).
export const ADMIN_RATING_STATUSES = ['HienThi', 'DaAn'] as const;
/** Nhận xét ở danh sách cắt tối đa 200 đơn vị UTF-16 (`string.length`, cùng đơn vị với trần 1.000 của `RATING_COMMENT_MAX_LENGTH`); chi tiết trả đầy đủ. */
export const ADMIN_RATING_PREVIEW_LENGTH = 200;
/** Từ khoá tìm `q` tối đa 100 ký tự `[đề xuất]` (không có mức tối thiểu; rỗng ⇒ như không có `q`). */
export const ADMIN_RATING_Q_MAX_LENGTH = 100;
