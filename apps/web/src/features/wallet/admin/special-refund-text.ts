// Chữ của tab "Hoàn tiền đặc biệt" (payment F8). Có trong Figma `550:2` trừ các câu ghi [đề xuất] (bước tra theo mã lịch hẹn, chọn khoản và màn xác nhận chưa có frame, PLAN 4.5).
export const SPECIAL_REFUND_TEXT = {
  // Figma `550:2`: dải thông tin đầu tab
  infoParts: [
    'Hoàn tiền đặc biệt cho phép Admin cộng lại số tiền cọc/thanh toán vào ví bệnh nhân ngoài chính sách hủy thông thường. Mỗi lịch hẹn chỉ được hoàn đặc biệt ',
    'một lần',
    '. Thao tác được ghi vào Audit Log.',
  ],
  formTitle: 'Nhập thông tin hoàn tiền',

  // [đề xuất] Thay ô "Bệnh nhân -- Chọn bệnh nhân --" của Figma bằng tra theo mã lịch hẹn (Trung chốt 20/11/2026; API B13 cần chọn KHOẢN thanh toán)
  codeLabel: 'Mã lịch hẹn',
  codeHint:
    'Nhập mã của lịch hẹn (kể cả lịch đã đổi) để tìm các khoản thanh toán qua ví còn hoàn được.',
  codePlaceholder: 'Ví dụ: CLX-20261010-7K3QF',
  search: 'Tìm',
  paymentsLabel: 'Khoản thanh toán',
  paymentsLoading: 'Đang tìm khoản thanh toán...',
  paymentsEmpty:
    'Không có khoản thanh toán qua ví nào còn hoàn được cho lịch hẹn này. Khoản trả bằng tiền mặt, khoản đã hoàn hết hoặc đã hoàn đặc biệt không hiện ở đây.',
  paymentOf: (maGiaoDich: string, maLichHen: string) =>
    `Khoản #${maGiaoDich} của lịch ${maLichHen}`,
  paidLabel: 'Đã thanh toán',
  refundedLabel: 'Đã hoàn',
  refundableLabel: 'Còn hoàn được',

  // Figma `550:2`
  amountLabel: 'Số tiền hoàn (VNĐ)',
  amountPlaceholder: 'Ví dụ: 100000',
  // [đề xuất] Số trần lấy nguyên từ máy chủ (WQL-05)
  amountHint: (cap: string) =>
    `Tối đa ${cap} (số còn hoàn được của khoản đã chọn).`,
  reasonLabel: 'Lý do hoàn tiền',
  reasonPlaceholder: 'Mô tả lý do hoàn tiền ngoài chính sách...',
  // [đề xuất]
  reasonHint:
    'Bắt buộc, 10 đến 255 ký tự. Lý do chỉ ghi vào nhật ký; bệnh nhân nhận thông báo chung, không thấy lý do này.',
  review: 'Xem xác nhận hoàn tiền',

  // [đề xuất] Màn xác nhận ở ngăn bên (Trung chốt 20/11/2026)
  confirmTitle: 'Xác nhận hoàn tiền đặc biệt',
  codeOfPayment: 'Mã giao dịch',
  appointment: 'Lịch hẹn',
  refundAmount: 'Số tiền hoàn',
  reason: 'Lý do',
  confirmPoints: (amount: string) => [
    `Ví CLINIX của bệnh nhân sẽ được cộng ${amount}.`,
    'Mỗi khoản thanh toán chỉ được hoàn đặc biệt một lần; thao tác không thể hoàn tác.',
    'Thao tác được ghi vào Audit Log và bệnh nhân nhận thông báo (không kèm lý do).',
  ],
  confirm: 'Xác nhận hoàn tiền',
  back: 'Quay lại',
  sending: 'Đang gửi...',

  // [đề xuất] Lỗi và kết quả
  codeRequired: 'Vui lòng nhập mã lịch hẹn.',
  paymentRequired: 'Vui lòng chọn khoản thanh toán cần hoàn.',
  amountInvalid: 'Số tiền hoàn phải là số nguyên dương, tính bằng đồng.',
  reasonRequired: 'Vui lòng nhập lý do (ít nhất 10 ký tự).',
  reasonTooLong: 'Lý do tối đa 255 ký tự.',
  // Máy chủ từ chối lý do (ví dụ chữ giống mật khẩu hay mã bí mật)
  reasonRejected:
    'Lý do không hợp lệ. Vui lòng nhập 10 đến 255 ký tự và không ghi mật khẩu hay mã bí mật.',
  refunded: (amount: string) => `Đã hoàn ${amount} vào ví của bệnh nhân.`,
  alreadyRefunded:
    'Khoản thanh toán này đã được hoàn đặc biệt. Danh sách đã được tải lại.',
  exceeds: (cap: string | null) =>
    cap === null
      ? 'Số tiền hoàn vượt quá số còn hoàn được. Danh sách đã được tải lại.'
      : `Số tiền hoàn vượt quá số còn hoàn được (${cap}). Danh sách đã được tải lại.`,
  notRefundable:
    'Khoản thanh toán không còn hoàn được. Danh sách đã được tải lại.',
  uncertain:
    'Chưa rõ thao tác đã được ghi nhận hay chưa. Danh sách đã được tải lại, hãy kiểm tra trước khi thử lại.',
  genericError: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
} as const;

/** Khớp `RefundablePaymentsQueryDto.maLichHen` (`MaxLength(20)`) của API B13. */
export const APPOINTMENT_CODE_MAX = 20;
/** Khớp `AUDIT_PAYMENT_LIMITS` của API B13 (lý do có ghi nhật ký). */
export const SPECIAL_REFUND_REASON_MIN = 10;
export const SPECIAL_REFUND_REASON_MAX = 255;
/** Khớp `AMOUNT_PATTERN` của `CreateSpecialRefundDto`: số nguyên đồng, 1 đến 10 chữ số, không số 0 đứng đầu. */
export const REFUND_AMOUNT_PATTERN = /^[1-9][0-9]{0,9}$/u;
