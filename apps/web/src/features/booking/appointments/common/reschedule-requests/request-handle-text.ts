import { REQUEST_TEXT } from './request-text';

// Chữ của hộp Duyệt, hộp Từ chối và các câu lỗi ghi (reschedule F4 Pha B1; PLAN reschedule 4.2 Q10, 5.7, 5.12, 5.13). Figma chưa có frame cho các hộp này (PLAN 4.4): toàn bộ chữ là `[đề xuất]` (Q13), nhóm sửa khi
// duyệt PR. Ghi chú của nhân sự đi NGUYÊN VĂN tới bệnh nhân (thông báo, thư, banner chi tiết lịch): ô nhập có dòng nhắc và lời dặn không nhập thông tin cá nhân hay mật khẩu (bộ che bí mật của máy chủ chỉ chặn
// một số dạng, nên lời dặn là hàng rào còn lại).
export const HANDLE_TEXT = {
  approve: 'Duyệt',
  reject: 'Từ chối',
  approveTitle: 'Duyệt yêu cầu đổi lịch',
  rejectTitle: 'Từ chối yêu cầu đổi lịch',
  noteLabel: 'Ghi chú xử lý',
  noteHint:
    'Bệnh nhân sẽ đọc ghi chú này. Không nhập thông tin cá nhân hay mật khẩu.',
  noteRequired: 'Vui lòng nhập ghi chú xử lý.',
  noteTooLong: 'Ghi chú xử lý tối đa 255 ký tự.',
  noteControl:
    'Ghi chú không được chứa ký tự điều khiển (xuống dòng thì được).',
  // 400 ở trường `ghiChu` dù web đã cho qua (bộ che bí mật, luật mới của máy chủ)
  noteInvalid:
    'Ghi chú không hợp lệ. Vui lòng kiểm tra lại, không nhập thông tin cá nhân hay mật khẩu.',
  approveIntro:
    'Hệ thống sẽ đổi lịch hẹn sang khung giờ mà bệnh nhân mong muốn.',
  approveSlotLabel: 'Khung giờ mong muốn',
  rejectIntro: 'Lịch hẹn giữ nguyên khung giờ hiện tại.',
  approveConfirm: 'Xác nhận duyệt',
  approving: 'Đang duyệt…',
  rejectConfirm: 'Xác nhận từ chối',
  rejecting: 'Đang từ chối…',
  close: 'Đóng',
  // Thông báo MỘT LẦN ở danh sách sau khi xử lý xong (chữ cố định theo danh sách trắng, không chữ của máy chủ)
  doneApproved: 'Đã duyệt yêu cầu đổi lịch.',
  doneRejected: 'Đã từ chối yêu cầu đổi lịch.',
  // Câu lỗi (`request-handle-failure.ts`)
  alreadyHandled: 'Yêu cầu này đã được xử lý.',
  notFound: REQUEST_TEXT.notFound,
  slotGonePick:
    'Khung giờ này không còn trống. Hãy chọn khung giờ khác hoặc từ chối yêu cầu.',
  slotGone: 'Khung giờ mong muốn không còn trống. Bạn có thể từ chối yêu cầu.',
  sameSlot:
    'Khung giờ này trùng với giờ hẹn hiện tại. Hãy chọn khung giờ khác.',
  otherDoctor:
    'Chỉ đổi được sang khung giờ của cùng bác sĩ. Hãy chọn khung giờ khác hoặc từ chối.',
  serviceChanged:
    'Bác sĩ đã đổi dịch vụ so với lúc đặt lịch nên không thể duyệt. Bạn vẫn có thể từ chối.',
  branchChanged:
    'Bác sĩ đã đổi chi nhánh so với lúc đặt lịch nên không thể duyệt. Bạn vẫn có thể từ chối.',
  systemError: 'Không thực hiện được, vui lòng thử lại.',
  unsure:
    'Chưa rõ yêu cầu đã được xử lý chưa. Hãy tải lại chi tiết để xem kết quả thật.',
} as const;
