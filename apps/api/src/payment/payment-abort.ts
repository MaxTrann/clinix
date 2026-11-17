// `PaymentAbort` — cách DÙNG CHUNG của `payment/` để HOÀN TÁC cả giao dịch tiền khi một bước SAU `confirmPaid` hay `checkIn` không đạt (payment B5; PLAN 5.10 E6, E7).
// `withBookingTransaction` đòi `work` KHÔNG ném `AppException` (ném thì người gọi mất kết quả có kiểu). Ở đây ta CẦN hoàn tác (ví dụ số dư thiếu sau khi `confirmPaid` đã đổi lịch sang `DaXacNhan`),
// nên ném `PaymentAbort` mang KẾT QUẢ CÓ KIỂU: `db.transaction` rollback, `withBookingTransaction` không thử lại (không phải 1213/1205), và người gọi bắt ĐÚNG lỗi này NGOÀI vỏ giao dịch
// rồi đổi `outcome` thành lỗi API. Lỗi khác (lỗi hệ thống, 1213 hết lượt) đi nguyên ra.
export class PaymentAbort<Outcome> extends Error {
  constructor(readonly outcome: Outcome) {
    super('PaymentAbort');
    this.name = 'PaymentAbort';
  }
}
