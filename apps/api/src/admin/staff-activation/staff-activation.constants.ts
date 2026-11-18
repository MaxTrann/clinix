// Hằng số của liên kết kích hoạt nhân sự (task B14 của module admin; PLAN admin mục 5.5; quyết định Q22, Q23, Q25).
// Ba giá trị cấu hình được (TTL, khoảng cách tối thiểu, số lần mỗi giờ) KHÔNG nằm ở đây mà ở biến môi trường STAFF_ACTIVATION_*
// (config/env.validation.ts); ở đây chỉ có những thứ cố định theo quyết định.

// Token = 32 byte ngẫu nhiên (256 bit), mã hoá base64url nên luôn dài đúng 43 ký tự (Q25).
export const ACTIVATION_TOKEN_BYTES = 32;
export const ACTIVATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Liên kết nằm ở FRAGMENT (sau dấu #) để token không vào log máy chủ hay header Referer (Q25).
export const ACTIVATION_PAGE_PATH = '/kich-hoat';

// "Tối đa N lần mỗi giờ" (Q23): cửa sổ đếm cố định 1 giờ, N lấy từ STAFF_ACTIVATION_RESEND_MAX_PER_HOUR.
export const ACTIVATION_RESEND_WINDOW_MS = 60 * 60 * 1000;
export const MS_PER_SECOND = 1000;
export const MS_PER_HOUR = 60 * 60 * 1000;

// Giao dịch hậu gửi chạy SAU khi thư đã đi nên không làm lại từ đầu được; gặp deadlock (1213) thì giao dịch đã hoàn tác trọn vẹn và các lệnh
// trong đó đều có điều kiện (idempotent) nên thử lại tối đa chừng này lần (cùng con số OTP_PHASE2_MAX_ATTEMPTS của auth).
export const ACTIVATION_PHASE2_MAX_ATTEMPTS = 3;

// Mã lỗi ổn định cho FE (PLAN 5.9). Hai mã đầu đã có ở auth; TAI_KHOAN_KHONG_CHO_KICH_HOAT là mã mới ở mã nguồn.
export const STAFF_ACTIVATION_ERROR_CODES = {
  // 429; cùng mã, cùng chữ, cùng chiTiet.soGiayCho với OTP để FE chỉ cần một cách xử lý
  RESEND_TOO_SOON: 'GUI_LAI_QUA_SOM',
  // KHÔNG phải lỗi HTTP: là giá trị trong `guiEmail` của B15 hoặc kết quả gửi lại của B20
  MAIL_FAILED: 'GUI_MAIL_LOI',
  // 409
  NOT_PENDING_STAFF: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
  // 400; task B16 (kích hoạt công khai): CÙNG một mã cho MỌI lý do liên kết không dùng được, để không lộ liên kết nào tồn tại (H6, NS-35)
  LINK_INVALID: 'LIEN_KET_KHONG_HOP_LE',
} as const;
