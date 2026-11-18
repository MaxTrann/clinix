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
  // B4: nạp ví qua cổng (PLAN 5.4, 5.14)
  GATEWAY_NOT_CONFIGURED: 'CONG_THANH_TOAN_CHUA_CAU_HINH', // 503: thiếu biến môi trường của cổng, không tạo dòng
  GATEWAY_ERROR: 'CONG_THANH_TOAN_LOI', // 503 (PLAN ghi 502; `AppException` chỉ cho 4xx và 503): tạo yêu cầu với cổng lỗi (dòng nạp chuyển `ThatBai`)
} as const;

/** `loai_su_kien` của thông báo nạp ví (PLAN 5.12; chữ `[đề xuất]`). Cột `varchar(100)` nên không cần đổi DDL. */
export const TOPUP_NOTIFICATION_EVENTS = {
  SUCCEEDED: 'NapViThanhCong',
  FAILED: 'NapViThatBai',
} as const;

/** Mã lý do ghi ở `lan_doi_soat_nap_vi.ly_do` khi lần cộng đầu (lúc xác minh IPN) lỗi: dạng MÃ, không văn bản lỗi gốc (PLAN 5.4 Q9). */
export const TOPUP_FIRST_CREDIT_FAILED = 'CONG_VI_LOI_KHI_XAC_MINH';

/** Câu chữ của các mã B6 và B4 (PLAN 5.14; `[đề xuất]`). `SO_TIEN_NGOAI_HAN_MUC` là mã của ví (`wallet.constants.ts`) nhưng nạp ví ném ở `payment/`. */
export const PAYMENT_ERROR_MESSAGES = {
  LICH_HEN_KHONG_CHO_THU_TIEN: 'Lịch hẹn không còn ở trạng thái đã xác nhận.',
  KHONG_CON_PHAI_THU: 'Lịch hẹn không còn khoản phải thu.',
  SO_TIEN_KHONG_KHOP: 'Số tiền thu không khớp số còn phải thu.',
  CONG_THANH_TOAN_CHUA_CAU_HINH: 'Cổng thanh toán hiện chưa sẵn sàng.',
  CONG_THANH_TOAN_LOI: 'Không kết nối được cổng thanh toán. Vui lòng thử lại.',
  SO_TIEN_NGOAI_HAN_MUC: 'Số tiền nằm ngoài hạn mức cho phép.',
} as const;

export type PaymentErrorCode =
  (typeof PAYMENT_ERROR_CODES)[keyof typeof PAYMENT_ERROR_CODES];
