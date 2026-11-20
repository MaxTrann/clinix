// Chữ của hộp "Thu tiền & tiếp đón" (payment F4). Có trong Figma `492:2` trừ các câu ghi [đề xuất] (trạng thái chưa có frame, PLAN 4.5, 4.6 mục 7).
// Câu theo mã lỗi lấy từ PLAN 5.14 khi có (cũng là [đề xuất], chờ nhóm duyệt).
export const CASH_TEXT = {
  title: 'Thu tiền & tiếp đón',
  close: 'Đóng',
  appointmentSection: 'Thông tin lịch hẹn',
  patient: 'Người khám',
  dateTime: 'Ngày / Giờ',
  doctor: 'Bác sĩ',
  totalSection: 'Tổng tiền khám',
  price: 'Giá khám',
  paidBefore: 'Đã thanh toán trước',
  collectHere: 'Thu tại quầy',
  // Figma `492:583`: "Xác nhận bệnh nhân đã nộp đủ **200.000đ** tiền mặt tại quầy trước khi nhấn xác nhận."
  confirmBefore: 'Xác nhận bệnh nhân đã nộp đủ ',
  confirmAfter: ' tiền mặt tại quầy trước khi nhấn xác nhận.',
  cancel: 'Hủy',
  submit: 'Thu tiền & tiếp đón',

  // [đề xuất] Trạng thái chưa có frame
  loading: 'Đang tải số tiền cần thu...',
  submitting: 'Đang thu tiền...',
  receiptTitle: 'Đã thu tiền và tiếp đón bệnh nhân.',
  receiptNo: 'Số phiếu',
  receiptTime: 'Thời điểm thu',
  receiptBy: 'Người thu',
  // Mất mạng hay hết giờ chờ lúc gửi: chưa rõ đã thu chưa. Bấm lại an toàn: nếu lần trước đã thu, máy chủ trả "không còn ở trạng thái đã xác nhận" (khoá lịch, TTQ-06)
  uncertain:
    'Chưa rõ tiền đã được ghi nhận hay chưa. Bạn có thể bấm lại: nếu đã thu, hệ thống sẽ báo lịch hẹn đã được tiếp đón và không thu lần hai.',
  genericError: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',

  // Theo mã lỗi (PLAN 5.14 khi có)
  errors: {
    // Số trên hộp đã cũ: hộp tải lại số mới để Lễ tân xem rồi bấm lại
    SO_TIEN_KHONG_KHOP:
      'Số tiền thu không khớp số còn phải thu. Số tiền đã được cập nhật, vui lòng kiểm tra lại.',
    LICH_HEN_KHONG_CHO_THU_TIEN: 'Lịch hẹn không còn ở trạng thái đã xác nhận.',
    KHONG_CON_PHAI_THU: 'Lịch hẹn không còn khoản phải thu.',
    // [đề xuất] 404 (không có, ở chi nhánh khác) và chưa cấu hình (cùng câu với route Lễ tân của booking)
    KHONG_TIM_THAY: 'Không tìm thấy lịch hẹn.',
    HE_THONG_CHUA_CAU_HINH: 'Hệ thống chưa được cấu hình.',
  },
  // `NGOAI_KHUNG_GIO_TIEP_DON` kèm `tu`, `den` (giờ Việt Nam)
  outsideWindow: (from: string, to: string) =>
    `Hiện chưa trong khung giờ tiếp đón. Chỉ thu tiền và tiếp đón từ ${from} đến ${to}.`,
  outsideWindowUnknown: 'Hiện chưa trong khung giờ tiếp đón của lịch hẹn này.',
} as const;

export type CashErrorCode = keyof typeof CASH_TEXT.errors;
