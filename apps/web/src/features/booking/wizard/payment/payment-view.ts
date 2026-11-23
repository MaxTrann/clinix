// Trang Thanh toán vẽ gì cho một lịch hẹn (booking F6, TRACKING 3.49 D5): CHỈ MỘT chỗ quyết định theo `trangThai` và hết hạn, để nút trả tiền không bao giờ hiện cho lịch không còn chờ thanh toán.
//   pay        `ChoThanhToan` còn hạn (hoặc không có hạn): đồng hồ, khung tóm tắt và `DepositPaymentPanel`.
//   expired    `ChoThanhToan` nhưng đã quá hạn theo giờ máy chủ (job quét hết hạn chạy mỗi phút nên lịch có thể còn `ChoThanhToan` vài giây sau mốc, Q4): thông báo hết hạn, KHÔNG nút trả tiền.
//   cancelled  `DaHuy` (thường do hết giữ chỗ; chi tiết không cho biết lý do nên câu trung tính): thông báo, không nút trả tiền.
//   done       mọi trạng thái khác (`DaXacNhan`, `VangMat`, `HoanThanh`, `DaTiepDon`, mã lạ): chuyển Bước 6, nơi đã có câu đúng cho từng trạng thái và một câu trung tính cho mã lạ.
export type PaymentView = 'pay' | 'expired' | 'cancelled' | 'done';

export function paymentViewOf(
  trangThai: string,
  expired: boolean,
): PaymentView {
  switch (trangThai) {
    case 'ChoThanhToan':
      return expired ? 'expired' : 'pay';
    case 'DaHuy':
      return 'cancelled';
    default:
      return 'done';
  }
}
