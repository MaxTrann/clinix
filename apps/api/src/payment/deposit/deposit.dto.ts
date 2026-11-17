// Thân và kết quả của hai route thanh toán cọc bằng ví (payment B5; PLAN 5.5, 5.11 #6, #7; Q14).

/**
 * Thân của `POST /patient/appointments/:maLichHen/payment` PHẢI RỖNG: lớp không có trường nào nên `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`) từ chối mọi khoá gửi lên
 * (`benhNhanId`, `viNoiBoId`, `soTien`…) bằng 400 `TRUONG_KHONG_DUOC_PHEP`. Chủ lịch chỉ lấy từ access token; số tiền chỉ lấy từ `tien_coc_snapshot` của lịch (QTT-03, TLK-15).
 */
export class PayDepositDto {}

/**
 * `GET …/payment-preview`: số do MÁY CHỦ tính (client không tự trừ tiền). `soDuSauThanhToan` là `null` khi `duSoDu = false` `[đề xuất]` (không có "số dư âm" để hiện; web hiện gợi ý nạp thêm).
 * `hanThanhToan` và `thoiGianMayChu` là ISO 8601 UTC; `hanThanhToan` `null` khi lịch không có hạn.
 */
export interface DepositPreview {
  soTienCan: string;
  soDuKhaDung: string;
  soDuSauThanhToan: string | null;
  duSoDu: boolean;
  hanThanhToan: string | null;
  thoiGianMayChu: string;
}

/**
 * `POST …/payment` 200: `daXuLyTruocDo = true` khi lịch đã được xác nhận từ trước (bấm đúp, hai tab, thử lại sau lỗi mạng): KHÔNG trừ lần hai. `soTien` là cọc của lịch;
 * `soDuKhaDung` là số khả dụng của ví SAU lần thanh toán này (hay hiện tại nếu đã xử lý trước đó).
 */
export interface DepositPaymentResult {
  maLichHen: string;
  trangThai: 'DaXacNhan';
  soTien: string;
  soDuKhaDung: string;
  daXuLyTruocDo: boolean;
}
