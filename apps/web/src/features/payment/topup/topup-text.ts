// Chữ của tab Nạp tiền và trang kết quả nạp (payment F2). Có trong Figma `430:2` trừ các câu ghi [đề xuất] (trạng thái chưa có frame, PLAN 4.5, L14).
export const TOPUP_TEXT = {
  stepAmount: 'Chọn số tiền nạp',
  stepGateway: 'Chọn phương thức thanh toán',
  amountLabel: 'Số tiền nạp',
  // Figma `430:2`: "50.000đ – 2.000.000đ / lần nạp" (số lấy từ API, không viết cứng)
  limitHint: (min: string, max: string) => `${min} – ${max} / lần nạp`,
  submit: 'Nạp tiền ngay →',
  gateways: {
    VNPay: { name: 'VNPAY', hint: 'Thanh toán qua cổng VNPAY' },
    MoMo: { name: 'MoMo', hint: 'Thanh toán qua ví MoMo' },
  },

  // [đề xuất] Trạng thái và lỗi chưa có frame
  submitting: 'Đang chuyển tới cổng thanh toán...',
  amountRequired: 'Vui lòng chọn hoặc nhập số tiền nạp.',
  amountOutOfRange: (min: string, max: string) =>
    `Số tiền nạp phải từ ${min} đến ${max}.`,
  amountInvalid: 'Số tiền không hợp lệ.',
  noGateway: 'Hiện chưa có cổng thanh toán nào sẵn sàng.',
  gatewayNotConfigured: 'Cổng thanh toán hiện chưa sẵn sàng.',
  gatewayError: 'Không kết nối được cổng thanh toán. Vui lòng thử lại.',
  badRedirect:
    'Không thể chuyển tới cổng thanh toán. Vui lòng thử lại hoặc liên hệ hỗ trợ.',
  // Timeout, mất mạng lúc gửi (WNT-06): yêu cầu có thể ĐÃ tạo giao dịch nên không tự gửi lại
  uncertain:
    'Chưa rõ yêu cầu nạp đã được ghi nhận hay chưa. Hãy kiểm tra Lịch sử giao dịch trước khi thử lại.',
  genericError: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',

  // Trang kết quả nạp [đề xuất]
  resultTitle: 'Kết quả nạp tiền',
  resultLoading: 'Đang kiểm tra kết quả giao dịch...',
  resultSuccess: 'Nạp tiền thành công',
  resultSuccessHint: 'Số tiền đã được cộng vào số dư khả dụng của ví.',
  resultFailed: 'Nạp tiền không thành công',
  resultFailedHint: 'Ví của bạn không thay đổi. Bạn có thể thử nạp lại.',
  resultPending: 'Giao dịch đang được xử lý',
  resultPendingHint:
    'Hệ thống chưa nhận được kết quả từ cổng thanh toán. Số tiền sẽ được cộng ngay khi có xác nhận.',
  resultStillPending:
    'Vẫn chưa có kết quả. Bạn có thể xem lại trong Lịch sử giao dịch sau ít phút.',
  checkAgain: 'Kiểm tra lại',
  resultNotFound: 'Không tìm thấy giao dịch nạp tiền.',
  resultAmount: 'Số tiền',
  resultCode: 'Mã giao dịch',
  backToWallet: 'Về Ví của tôi',
} as const;
