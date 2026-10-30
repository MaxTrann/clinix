import argon2 from 'argon2';

// Tham số băm mật khẩu (quyết định S6): Argon2id, bộ nhớ 19 MiB (= 19456 KiB), 2 lượt, 1 luồng.
// Test SE-01 kiểm đúng các giá trị này trong chuỗi băm lưu ở DB. Muốn đổi phải đổi quyết định S6 trước, không sửa lặng lẽ ở đây.
// Các hằng của task sau được thêm vào file này khi task đó cần (OTP: task A2, ở cuối file).
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

// --- Token và phiên đăng nhập (task A3, quyết định Q2). Cố định theo quyết định nên là hằng số, không phải biến môi trường.
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // access JWT sống 15 phút
export const SESSION_IDLE_MS = 30 * 60 * 1000; // phiên không hoạt động quá 30 phút thì hết hạn (trượt theo mỗi lần làm mới)
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000; // trần tuyệt đối 8 giờ kể từ lúc đăng nhập (tao_luc), không gia hạn được

export const ACCESS_TOKEN_ALGORITHM = 'HS256'; // cố định; verify chỉ nhận đúng thuật toán này (chặn alg: none / đổi alg)
export const ACCESS_TOKEN_ISSUER = 'clinix-api';
export const ACCESS_TOKEN_AUDIENCE = 'clinix-web';

export const REFRESH_TOKEN_RANDOM_BYTES = 32; // 256 bit ngẫu nhiên
export const REFRESH_COOKIE_NAME = 'refresh_token';
// Đường dẫn NHÌN TỪ TRÌNH DUYỆT (proxy gỡ tiền tố /api trước khi tới API), nên cookie chỉ được gửi tới /api/auth/*
export const REFRESH_COOKIE_PATH = '/api/auth';

// --- Guard đăng nhập và vai trò (task A4). Mã lỗi ổn định để frontend chọn hành động theo MÃ, không theo câu chữ.
// Mã đặt trong `message` của lỗi HTTP (cùng quy ước với ORIGIN_KHONG_HOP_LE); dạng JSON chuẩn do bộ lọc lỗi P5 quyết định.
export const AUTH_ERROR_CODES = {
  // 401: không có access token dùng được (thiếu header, sai scheme, Bearer rỗng) hoặc route cần vai trò mà chưa có người dùng
  NOT_LOGGED_IN: 'CHUA_DANG_NHAP', // [đề xuất]
  // 401: token không qua được kiểm tra (sai chữ ký, alg none hoặc alg khác, khoá khác, hết hạn, sai iss/aud/typ, claims hỏng)
  INVALID_TOKEN: 'TOKEN_KHONG_HOP_LE', // [đề xuất]
  // 401: token đúng nhưng phiên không còn dùng được (đã thu hồi, quá trần 8 giờ, không đúng chủ) hoặc tài khoản không DangHoatDong
  SESSION_INACTIVE: 'PHIEN_HET_HIEU_LUC', // [đề xuất]
  // 403: đã đăng nhập nhưng vai trò không nằm trong @Roles(). Mã đã có trong plan admin (mục 5.9), dùng chung để FE chỉ cần một mã
  FORBIDDEN: 'KHONG_DU_QUYEN',
} as const;

// --- Mã OTP (task A2; quyết định S3, G2, N1; quy tắc nghiệp vụ 16–17 của docs/database). Cố định theo quyết định nên là hằng số.
export const OTP_LENGTH = 6; // ĐK b6, QMK b5: mã 6 chữ số
// Hiệu lực 10 phút (G2). Cả hạn lưu ở DB lẫn chữ "10 phút" trong thư (renderOtpMail) lấy từ ĐÚNG hằng này nên không thể lệch nhau.
export const OTP_TTL_MINUTES = 10;
export const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;
export const OTP_MAX_WRONG_ATTEMPTS = 5; // ĐK A3/8d: mỗi mã tối đa 5 lần nhập sai, đủ 5 lần thì mã bị thu hồi
export const OTP_RESEND_MIN_INTERVAL_MS = 60 * 1000; // ĐK A2/4d: mã mới cách mã trước (theo tao_luc) ít nhất 60 giây
export const OTP_MAX_PER_WINDOW = 5; // ĐK A2/4d: tối đa 5 mã trong cửa sổ dưới đây, theo (tài khoản, loại), tính cả mã gửi lỗi
export const OTP_WINDOW_MS = 60 * 60 * 1000; // cửa sổ 1 giờ
// Pha 2 của cấp mã (ghi kết quả gửi) chạy SAU khi thư đã đi nên không thể làm lại từ đầu; gặp deadlock (1213) thì giao dịch đã hoàn tác hoàn toàn
// và các lệnh trong đó đều có điều kiện (idempotent), nên thử lại tối đa chừng này lần (task A5, sau khi đo deadlock chéo tài khoản của A2)
export const OTP_PHASE2_MAX_ATTEMPTS = 3;

// --- Đăng ký (task A5; quyết định Q4, Q5, Q7, N1)
// Bệnh nhân chưa xác minh email sống 24 giờ kể từ thoi_diem_tao, KHÔNG gia hạn khi gửi lại OTP (ĐK b5, Q4); quá hạn là bị xoá (nửa mở:
// đúng 24:00:00 là hết, cùng kiểu OTP và phiên). Không bao giờ xoá nhân sự, và (quyết định A5-F) không xoá tài khoản NgungHoatDong.
export const UNVERIFIED_ACCOUNT_TTL_MS = 24 * 60 * 60 * 1000;
// Số lần thử tối đa của POST /auth/register khi đua với yêu cầu khác (lỗi trùng khoá hoặc deadlock thì làm lại từ đầu); hết thì lỗi 500 có log.
export const REGISTER_MAX_ATTEMPTS = 3;
// Mã lỗi của đăng ký (PLAN 5.5). EMAIL_DA_DUNG: 409. GUI_MAIL_LOI: 503 (AppException cho phép đúng 503; quyết định A5-B).
// TAI_KHOAN_NGUNG: 403 (quyết định A6-D), xác minh/gửi lại OTP đăng ký của Bệnh nhân chưa xác minh bị admin ngưng hoạt động; A8 (đăng nhập)
// dùng CÙNG mã và CÙNG trạng thái HTTP để FE chỉ cần một cách xử lý.
export const REGISTER_ERROR_CODES = {
  EMAIL_IN_USE: 'EMAIL_DA_DUNG',
  MAIL_FAILED: 'GUI_MAIL_LOI',
  ACCOUNT_SUSPENDED: 'TAI_KHOAN_NGUNG',
} as const;

// --- Đăng nhập (task A8; quy tắc nghiệp vụ 18 và 23 của docs/database, PLAN 5.3; quyết định Q5, N2, G1). Cố định theo quyết định nên là hằng số.
export const LOGIN_MAX_FAILURES = 5; // ĐN A1/6d: đủ 5 lần sai liên tiếp thì khoá tạm
export const LOGIN_LOCK_MS = 15 * 60 * 1000; // ĐN A1/6d: khoá 15 phút kể từ lần sai thứ 5 (nửa mở: đúng mốc là hết khoá)
// Mã lỗi riêng của đăng nhập (PLAN 5.5). HTTP: quyết định A8-D (login/login-errors.ts). TAI_KHOAN_NGUNG dùng lại REGISTER_ERROR_CODES.ACCOUNT_SUSPENDED
// (cùng mã và cùng trạng thái 403 với verify-otp/resend-otp, A6-D).
export const LOGIN_ERROR_CODES = {
  BAD_CREDENTIALS: 'DANG_NHAP_SAI',
  LOCKED: 'TAI_KHOAN_BI_KHOA_TAM',
  PENDING_ACTIVATION: 'TAI_KHOAN_CHUA_KICH_HOAT',
  EMAIL_NOT_VERIFIED: 'EMAIL_CHUA_XAC_MINH',
} as const;

// --- Quên mật khẩu (1) (task A11; quyết định S2, S4, Q6, N6; PLAN 5.1). resetToken: JWT HS256 ký bằng JWT_RESET_SECRET, KHÁC khoá access và refresh (SE-06).
// Hạn 10 phút TÍNH TỪ LÚC XÁC MINH OTP (không từ lúc cấp OTP), nửa mở: đúng 10:00 là hết. Cố định theo quyết định nên là hằng số.
export const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
export const RESET_TOKEN_ALGORITHM = 'HS256'; // cố định; verify chỉ nhận đúng thuật toán này (chặn alg: none / đổi alg)
export const RESET_TOKEN_ISSUER = 'clinix-api';
// Mục đích của token nằm ở `aud`: access token (aud khác, khoá khác) không dùng làm resetToken được và ngược lại (QM-14)
export const RESET_TOKEN_AUDIENCE = 'clinix-reset-password';
// Mã lỗi riêng của quên mật khẩu (PLAN 5.5). EMAIL_CHUA_DANG_KY: HTTP 404 (email lạ, hoặc Bệnh nhân chưa xác minh đã quá 24 giờ, quyết định Q5 của A11);
// TAI_KHOAN_CHUA_KICH_HOAT dùng lại LOGIN_ERROR_CODES.PENDING_ACTIVATION (403) và GUI_MAIL_LOI dùng lại REGISTER_ERROR_CODES.MAIL_FAILED (503).
export const FORGOT_PASSWORD_ERROR_CODES = {
  EMAIL_NOT_REGISTERED: 'EMAIL_CHUA_DANG_KY',
} as const;

// --- Job dọn tài khoản Bệnh nhân chưa xác minh quá 24 giờ (task A7; ĐK b5 câu cuối, Q4, quyết định A7-A…). Cố định theo quyết định nên là hằng số.
export const UNVERIFIED_CLEANUP_JOB_NAME = 'unverified-patient-cleanup';
// Cron 6 trường (giây phút giờ ngày tháng thứ): mỗi giờ vào phút 15, lệch phút 0 của job dọn ảnh (P7) để hai job không dồn vào cùng giây. Việc dọn không
// quyết định đúng/sai (xác minh và gửi lại đã từ chối tài khoản quá hạn, đăng ký lại xoá lười) nên trễ tối đa khoảng một giờ là chấp nhận được.
export const UNVERIFIED_CLEANUP_CRON = '0 15 * * * *';
// Quét ứng viên theo lô theo khoá chính tăng dần; mỗi lượt tối đa MAX_BATCHES lô (tối đa 1000 tài khoản), phần còn lại để lượt sau (TECH_DEBT dòng 35).
export const UNVERIFIED_CLEANUP_BATCH_SIZE = 100;
export const UNVERIFIED_CLEANUP_MAX_BATCHES = 10;
