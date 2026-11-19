// Hằng của module ví (payment P3; PLAN payment 5.14, Q20). Tiền là chuỗi decimal hai chữ số như cột `decimal(12,2)`; mọi phép tiền qua `pricing/money.ts`.

/**
 * Hạn mức Q20 (Đại chốt 15/11/2026: số Figma làm hằng, KHÔNG thêm cột cấu hình): nạp 50.000đ đến 2.000.000đ mỗi lần; rút tối thiểu 10.000đ, tối đa là số dư khả dụng
 * (nên không có hằng "rút tối đa"). Kiểm hạn mức là việc của service nạp và rút (B-task), không phải của `WalletLedger`.
 */
export const TOPUP_MIN = '50000.00';
export const TOPUP_MAX = '2000000.00';
export const WITHDRAW_MIN = '10000.00';

/**
 * Cửa sổ "nạp chờ xác nhận" (PLAN payment 4.7 #2, Đại đồng ý 16/11/2026): giao dịch nạp `DangXuLy` quá số phút này kể từ lúc tạo thì KHÔNG còn tính vào `napChoXacNhan` và hiện nhãn
 * "Chưa nhận kết quả" ở lịch sử; trạng thái trong DB vẫn `DangXuLy` (chỉ lọc khi hiển thị, IPN đến muộn vẫn được xử lý). VNPAY 90 phút `[đề xuất]`, MoMo tạm bằng VNPAY (X2, X3 đo lại).
 */
export const TOPUP_PENDING_WINDOW_MINUTES = {
  VNPay: 90,
  MoMo: 90,
} as const;

/** Cổng nạp ví mà API này biết (khớp `phuong_thuc` của `giao_dich_thanh_toan`). */
export const TOPUP_GATEWAYS = ['VNPay', 'MoMo'] as const;
export type TopupGateway = (typeof TOPUP_GATEWAYS)[number];

/** Phân trang "Lịch sử giao dịch" ví `[đề xuất]`: mặc định 20, tối đa 50 mỗi trang (như danh sách hồ sơ khám). */
export const WALLET_HISTORY_DEFAULT_PAGE_SIZE = 20;
export const WALLET_HISTORY_MAX_PAGE_SIZE = 50;

/** Số lần ghi `lich_su_hoan_tien` tự động tối đa cho MỘT khoản thanh toán: một lần đầu cộng ba lần `RefundRetryJob` thử lại `[đề xuất]` (PLAN 5.6). */
export const REFUND_MAX_ATTEMPTS = 4;
/** Số lần job đối soát nạp ví thử lại một giao dịch `ChoDoiSoat` trước khi chuyển Quản trị viên xử lý (2.4 NTV b16 đến b18). */
export const TOPUP_RECONCILE_MAX_RETRIES = 3;
/** Khoảng chờ tối thiểu giữa hai lần thử lại (hoàn tiền, đối soát), tính từ lần ghi cuối. */
export const REFUND_RETRY_GAP_MINUTES = 5;

/**
 * Mã lỗi nghiệp vụ ổn định của ví và rút tiền (PLAN 5.14; chữ `[đề xuất]`, nhóm duyệt và đưa vào Figma). Mã chung (`KHONG_TIM_THAY`, `KHONG_DU_QUYEN`, `DU_LIEU_KHONG_HOP_LE`…) đã có ở
 * `common/errors/error-codes.ts` nên KHÔNG khai lại. Mã của cổng thanh toán và thu tiền (`CONG_THANH_TOAN_*`, `LICH_HEN_KHONG_*`, `SO_TIEN_KHONG_KHOP`…) thuộc `payment/`, thêm ở task của chúng.
 */
export const WALLET_ERROR_CODES = {
  INSUFFICIENT_BALANCE: 'SO_DU_KHONG_DU', // 409, kèm chiTiet { soDuKhaDung, soTienCan }
  INVALID_AMOUNT: 'SO_TIEN_KHONG_HOP_LE', // 400
  AMOUNT_OUT_OF_RANGE: 'SO_TIEN_NGOAI_HAN_MUC', // 400, kèm chiTiet { toiThieu, toiDa }
  PENDING_WITHDRAWAL_EXISTS: 'DA_CO_YEU_CAU_CHO_DUYET', // 409
  WITHDRAWAL_ALREADY_HANDLED: 'YEU_CAU_DA_XU_LY', // 409, kèm chiTiet.trangThai
  ALREADY_SPECIALLY_REFUNDED: 'DA_HOAN_DAC_BIET', // 409
  REFUND_EXCEEDS_PAID: 'SO_TIEN_HOAN_VUOT_QUA_DA_THANH_TOAN', // 409, kèm chiTiet.conCoTheHoan
} as const;

export type WalletErrorCode =
  (typeof WALLET_ERROR_CODES)[keyof typeof WALLET_ERROR_CODES];

/** Câu chữ của các mã rút tiền (payment B11; PLAN 5.14; `[đề xuất]`). Web chọn câu theo `maLoi`, không theo chữ này. */
export const WALLET_ERROR_MESSAGES = {
  SO_DU_KHONG_DU: 'Số dư ví không đủ. Hãy nạp thêm tiền.',
  SO_TIEN_NGOAI_HAN_MUC: 'Số tiền nằm ngoài hạn mức cho phép.',
  DA_CO_YEU_CAU_CHO_DUYET: 'Bạn đang có một yêu cầu rút tiền chờ duyệt.',
  YEU_CAU_DA_XU_LY: 'Yêu cầu rút tiền này đã được xử lý.',
  // payment B13 (PLAN 5.14)
  DA_HOAN_DAC_BIET: 'Giao dịch này đã được hoàn đặc biệt.',
  SO_TIEN_HOAN_VUOT_QUA_DA_THANH_TOAN: 'Số tiền hoàn vượt quá số có thể hoàn.',
} as const;

/** `loai_su_kien` của thông báo rút tiền (PLAN 5.12; chữ `[đề xuất]`). */
export const WITHDRAWAL_NOTIFICATION_EVENTS = {
  SUBMITTED: 'RutTienDaGui',
  APPROVED: 'RutTienDuocDuyet',
  REJECTED: 'RutTienBiTuChoi',
} as const;

/** Ghi chú của Quản trị viên khi duyệt hoặc từ chối: tối đa 200 ký tự (Trung chốt 19/11/2026; nằm dưới giới hạn 255 của nhật ký). */
export const WITHDRAWAL_NOTE_MAX = 200;
/** Phân trang danh sách yêu cầu rút của Quản trị viên (như lịch sử ví): mặc định 20, tối đa 50. */
export const WITHDRAWAL_ADMIN_DEFAULT_PAGE_SIZE = 20;
export const WITHDRAWAL_ADMIN_MAX_PAGE_SIZE = 50;
/** Số giao dịch ví gần đây hiện ở chi tiết yêu cầu (2.4 XRT b2). */
export const WITHDRAWAL_RECENT_LEDGER_ROWS = 10;

/**
 * Hoàn cọc tự động (payment B8; PLAN 5.6.1). `RefundRetryJob` chạy MỖI PHÚT (cùng nhịp `HOLD_EXPIRY_CRON` của booking, lệch giây để hai job không dồn một lúc); mỗi lượt quét theo lô để một lượt không chiếm
 * kết nối quá lâu. Số lô tối đa và cỡ lô theo nếp `BOOKING_JOB_*` của booking.
 */
export const REFUND_RETRY_CRON = '40 * * * * *';
export const REFUND_RETRY_JOB_NAME = 'wallet-refund-retry';
export const REFUND_RETRY_BATCH_SIZE = 100;
export const REFUND_RETRY_MAX_BATCHES = 10;

/** `loai_su_kien` của thông báo hoàn cọc (PLAN 5.12; chữ `[đề xuất]`). Cột là `varchar(100)` nên không cần đổi DDL. */
export const REFUND_NOTIFICATION_EVENTS = {
  REFUNDED: 'HoanCocThanhCong',
  NEEDS_ATTENTION: 'HoanCocCanXuLy',
  // payment B13: hoàn tiền đặc biệt, gắn lịch cuối của chuỗi (Trung chốt 19/11/2026)
  SPECIAL_REFUND: 'HoanTienDacBiet',
} as const;

/** `thong_bao.noi_dung` tối đa 500 ký tự (cột `varchar(500)`). */
export const NOTIFICATION_MAX_LENGTH = 500;
