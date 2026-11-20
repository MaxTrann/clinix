// Chữ của thành phần thanh toán cọc (payment F3). Có trong Figma `452:2` trừ các câu ghi [đề xuất] (trạng thái chưa có frame, PLAN 4.5, 4.6 mục 7).
// Câu theo mã lỗi lấy từ PLAN 5.14 (cũng là [đề xuất], chờ nhóm duyệt).
export const DEPOSIT_TEXT = {
  amountLabel: 'Số tiền cần thanh toán',
  currentBalance: 'Số dư ví hiện tại',
  balanceAfter: 'Số dư sau thanh toán',
  // Figma `452:207`: "Thanh toán 100.000đ từ ví" (số lấy từ API)
  submit: (amount: string) => `Thanh toán ${amount} từ ví`,

  // [đề xuất] Trạng thái chưa có frame
  loading: 'Đang tải thông tin thanh toán...',
  submitting: 'Đang thanh toán...',
  insufficient: 'Số dư ví không đủ để thanh toán. Hãy nạp thêm tiền.',
  topupLink: 'Nạp tiền vào ví',
  paid: 'Thanh toán thành công. Lịch hẹn đã được xác nhận.',
  paidBefore: 'Lịch hẹn này đã được thanh toán trước đó. Ví không bị trừ thêm.',
  // Hết giờ chờ hay mất mạng lúc gửi: chưa rõ máy chủ đã trừ chưa, nhưng gửi lại an toàn vì máy chủ không trừ lần hai (TLK-04)
  uncertain:
    'Chưa rõ thanh toán đã được ghi nhận hay chưa. Bạn có thể bấm thanh toán lại: ví sẽ không bị trừ hai lần.',
  genericError: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',

  // Theo mã lỗi (PLAN 5.14)
  errors: {
    SO_DU_KHONG_DU: 'Số dư ví không đủ. Hãy nạp thêm tiền.',
    HET_HAN_GIU_CHO:
      'Lịch hẹn đã hết thời gian giữ chỗ và đã bị hủy. Ví của bạn chưa bị trừ tiền.',
    LICH_HEN_KHONG_CHO_THANH_TOAN:
      'Lịch hẹn này không còn ở trạng thái chờ thanh toán.',
    LICH_HEN_KHONG_CAN_COC: 'Lịch hẹn này không yêu cầu đặt cọc.',
    // [đề xuất] 404: lịch không tồn tại hay của người khác (cùng một câu, không lộ lịch có tồn tại)
    KHONG_TIM_THAY: 'Không tìm thấy lịch hẹn.',
  },
} as const;

export type DepositErrorCode = keyof typeof DEPOSIT_TEXT.errors;
