// Chữ của trang đổi lịch hẹn và nút ở chi tiết (reschedule F1). Toàn bộ là [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho đổi lịch: PLAN reschedule 4.4; Q13: Đại sửa chữ khi duyệt PR).
// Câu theo `maLoi` nằm ở `reschedule-errors.ts` (PLAN 5.13), không lặp ở đây.
export const RESCHEDULE_TEXT = {
  // Nút ở chi tiết lịch hẹn (WDH-01)
  changeButton: 'Đổi lịch',
  requestButton: 'Gửi yêu cầu đổi lịch',
  pendingReason: 'Lịch hẹn này đã có yêu cầu đổi lịch đang chờ duyệt.',
  // Trang chọn khung giờ (WDH-02)
  title: 'Đổi lịch hẹn',
  backToDetail: 'Chi tiết lịch hẹn',
  loading: 'Đang tải thông tin đổi lịch...',
  currentTitle: 'Lịch hiện tại',
  visitDate: 'Ngày khám',
  visitTime: 'Giờ khám',
  pickTitle: 'Chọn khung giờ mới',
  pickHint:
    'Chỉ đổi được sang khung giờ còn trống của cùng bác sĩ. Chọn một khung giờ để tiếp tục, lịch hiện tại chưa thay đổi.',
  requestNotice:
    'Bạn đã dùng hết số lần tự đổi. Chọn khung giờ mới, ở bước sau bạn nhập lý do để gửi yêu cầu cho Lễ tân duyệt; lịch hiện tại được giữ nguyên cho tới khi có kết quả.',
  // Hai số lấy NGUYÊN từ máy chủ, không tính toán ở client ("còn n lần" là việc của F2)
  usedCount: (used: number, max: number) =>
    `Bạn đã tự đổi ${used} trên ${max} lần.`,
  backToDetailLink: 'Quay lại chi tiết lịch hẹn',
  retry: 'Thử lại',
  // Màn xác nhận (đích sau khi chọn ô; thân thật là việc của F2)
  confirmTitle: 'Xác nhận đổi lịch',
  confirmNotReady: 'Bước xác nhận đổi lịch chưa được triển khai.',
  pickAnother: 'Chọn khung giờ khác',
  invalidLink: 'Liên kết chọn khung giờ không hợp lệ.',
} as const;
