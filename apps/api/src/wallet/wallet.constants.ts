// Hằng của module ví (payment P3; PLAN payment 5.14, Q20). Tiền là chuỗi decimal hai chữ số như cột `decimal(12,2)`; mọi phép tiền qua `pricing/money.ts`.

/**
 * Hạn mức Q20 (Đại chốt 15/11/2026: số Figma làm hằng, KHÔNG thêm cột cấu hình): nạp 50.000đ đến 2.000.000đ mỗi lần; rút tối thiểu 10.000đ, tối đa là số dư khả dụng
 * (nên không có hằng "rút tối đa"). Kiểm hạn mức là việc của service nạp và rút (B-task), không phải của `WalletLedger`.
 */
export const TOPUP_MIN = '50000.00';
export const TOPUP_MAX = '2000000.00';
export const WITHDRAW_MIN = '10000.00';

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
