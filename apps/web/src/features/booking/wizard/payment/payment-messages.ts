import { DETAIL_TEXT } from '../../appointments/patient/detail/detail-messages';
import { DONE_TEXT } from '../done/done-messages';

// Chữ của Bước Thanh toán (booking F6). Chữ của Figma `452:2` khi có ("Thời gian giữ chỗ còn lại"); còn lại là [đề xuất] (Đại duyệt từng nhóm chữ, TRACKING 3.49 D9, D11): Figma chỉ có trạng thái
// đang thanh toán, không có frame cho hết hạn, đã hủy, đang tải, lỗi. Chữ giống hệt Bước 6 và trang chi tiết dùng lại từ `DONE_TEXT`, `DETAIL_TEXT`. Không câu nào nêu số phút cố định: thời gian giữ chỗ
// là cấu hình (Q2) mà API không trả, và không câu nào hứa email hay thông báo.
export const PAYMENT_TEXT = {
  // Dùng lại
  loading: DETAIL_TEXT.loading,
  codeLabel: DONE_TEXT.codeLabel,
  price: DONE_TEXT.price,
  deposit: DONE_TEXT.deposit,
  costTitle: DONE_TEXT.costTitle,
  myAppointments: DETAIL_TEXT.backToList,
  nextLabel: DONE_TEXT.nextLabel,

  // Figma `452:2`
  timerLabel: 'Thời gian giữ chỗ còn lại',

  // [đề xuất]
  title: 'Thanh toán cọc',
  hurry: 'Sắp hết thời gian giữ chỗ',
  later: 'Để sau, xem chi tiết lịch hẹn',
  laterLabel: 'Thanh toán sau',
  expiredTitle: 'Đã hết thời gian giữ chỗ',
  expiredNote:
    'Lịch hẹn sẽ được hủy tự động và khung giờ được trả lại. Bạn có thể chọn giờ khám khác.',
  cancelledTitle: 'Lịch hẹn đã bị hủy',
  cancelledNote:
    'Lịch hẹn này đã bị hủy nên không thể thanh toán. Khung giờ đã được trả lại; bạn có thể chọn giờ khám khác.',
  checking: 'Đang kiểm tra lại với hệ thống...',
  pickAnother: 'Chọn giờ khác',
} as const;

// Câu cho trình đọc màn hình, CHỈ ở ba mốc (WZ-14): không đọc từng giây. Chữ `[đề xuất]`.
export const HOLD_ANNOUNCEMENTS = {
  within5: 'Sắp hết thời gian giữ chỗ: còn không quá 5 phút.',
  within1: 'Còn không quá 1 phút để thanh toán cọc.',
  ended: 'Đã hết thời gian giữ chỗ.',
} as const;
