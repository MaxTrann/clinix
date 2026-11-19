// Chữ của tab Rút tiền (payment F6). Có trong Figma `431:2`, `436:2`, `437:2` trừ các câu ghi [đề xuất] (trạng thái chưa có frame, PLAN 4.5).
export const WITHDRAW_TEXT = {
  available: 'Số dư khả dụng',
  amountLabel: 'Số tiền muốn rút',
  amountPlaceholder: 'Nhập số tiền...',
  // Figma `431:2`: "Tối đa 350.000đ (số dư khả dụng hiện tại)" (số lấy từ API)
  maxHint: (max: string) => `Tối đa ${max} (số dư khả dụng hiện tại)`,
  notice:
    'Số dư không bị trừ ngay — chỉ bị trừ khi Admin duyệt yêu cầu. Thông tin tài khoản nhận tiền sẽ thu thập ở bước sau.',
  submit: 'Gửi yêu cầu rút tiền',
  // Figma `437:2`
  held: (amount: string) =>
    `${amount} đang giữ chờ duyệt — sẽ được Admin xử lý sớm.`,
  successTitle: 'Yêu cầu đã được ghi nhận!',
  successBalances: 'Số dư khả dụng:',
  successHeld: 'Đang giữ:',

  // [đề xuất] Trạng thái và lỗi chưa có frame
  submitting: 'Đang gửi yêu cầu...',
  // Thay nút "Gửi yêu cầu khác" của `437:2`: còn yêu cầu ChoDuyet thì không gửi được yêu cầu mới (WRT-04, Q8; Trung chốt 19/11/2026)
  nextRequestHint: 'Bạn có thể gửi yêu cầu mới sau khi yêu cầu này được xử lý.',
  pendingExists: 'Bạn đang có một yêu cầu rút tiền chờ duyệt.',
  amountRequired: 'Vui lòng nhập số tiền muốn rút.',
  overAvailable: (max: string) =>
    `Số tiền rút không được vượt quá ${max} (số dư khả dụng hiện tại).`,
  insufficient: 'Số dư ví không đủ. Hãy nạp thêm tiền.',
  belowMinimum: (min: string) => `Số tiền rút tối thiểu là ${min}.`,
  outOfRange: 'Số tiền nằm ngoài hạn mức cho phép.',
  amountInvalid: 'Số tiền không hợp lệ.',
  // Timeout, mất mạng lúc gửi (WRT-03): yêu cầu có thể ĐÃ được tạo nên không tự gửi lại
  uncertain:
    'Chưa rõ yêu cầu rút đã được ghi nhận hay chưa. Hãy kiểm tra Lịch sử giao dịch trước khi thử lại.',
  genericError: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
  unavailable:
    'Chưa tải được số dư ví. Hãy bấm "Thử lại" ở phần số dư phía trên.',
  loading: 'Đang tải thông tin rút tiền...',
} as const;
