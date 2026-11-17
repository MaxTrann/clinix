// Mã lỗi nghiệp vụ ổn định của `payment/` (PLAN payment 5.14; chữ `[đề xuất]`, nhóm duyệt và đưa vào Figma). Mã chung (`KHONG_TIM_THAY`, `KHONG_DU_QUYEN`, `DU_LIEU_KHONG_HOP_LE`, `TRUONG_KHONG_DUOC_PHEP`,
// `HE_THONG_DANG_BAN`…) đã có ở `common/errors/error-codes.ts` và `appointments.constants.ts` nên KHÔNG khai lại. `SO_DU_KHONG_DU` do `wallet.constants.ts` giữ (dùng chung cho thanh toán cọc và rút tiền).
// Mỗi task B thêm mã của mình vào đây; B5 thêm ba mã của thanh toán cọc bằng ví.
export const PAYMENT_ERROR_CODES = {
  HOLD_EXPIRED: 'HET_HAN_GIU_CHO', // 409: lịch đã bị huỷ do hết hạn giữ chỗ (ví chưa bị trừ)
  NOT_AWAITING_PAYMENT: 'LICH_HEN_KHONG_CHO_THANH_TOAN', // 409, kèm chiTiet.trangThai
  NO_DEPOSIT_REQUIRED: 'LICH_HEN_KHONG_CAN_COC', // 409: cọc 0đ, không có gì để thanh toán
  // B6: thu tiền mặt tại quầy (PLAN 5.7, 5.14)
  NOT_COLLECTABLE: 'LICH_HEN_KHONG_CHO_THU_TIEN', // 409, kèm chiTiet.trangThai: lịch không còn `DaXacNhan`
  NOTHING_TO_COLLECT: 'KHONG_CON_PHAI_THU', // 409: số còn phải thu bằng 0
  AMOUNT_MISMATCH: 'SO_TIEN_KHONG_KHOP', // 409, kèm chiTiet.conPhaiThu
} as const;

/** Câu chữ của các mã B6 (PLAN 5.14; `[đề xuất]`). */
export const PAYMENT_ERROR_MESSAGES = {
  LICH_HEN_KHONG_CHO_THU_TIEN: 'Lịch hẹn không còn ở trạng thái đã xác nhận.',
  KHONG_CON_PHAI_THU: 'Lịch hẹn không còn khoản phải thu.',
  SO_TIEN_KHONG_KHOP: 'Số tiền thu không khớp số còn phải thu.',
} as const;

export type PaymentErrorCode =
  (typeof PAYMENT_ERROR_CODES)[keyof typeof PAYMENT_ERROR_CODES];
