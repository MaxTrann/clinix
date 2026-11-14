import { DETAIL_TEXT } from '../../appointments/patient/detail/detail-messages';
import { LIST_TEXT } from '../../appointments/patient/list-messages';

// Chữ của Bước 6 "Hoàn tất" (booking F7). Chữ của Figma `453:2` khi có; còn lại là [đề xuất] (TRACKING 3.36 F7-F, F7-G, F7-N): Figma chỉ có trạng thái thành công,
// không có frame cho lịch không ở `DaXacNhan`, đang tải, lỗi, không tìm thấy. Câu nào cũng chỉ nói điều đã có thật: KHÔNG hứa email hay thông báo (B15 chưa làm).
// Chữ giống hệt trang chi tiết của F2 (cùng một lịch hẹn) dùng lại từ `DETAIL_TEXT` và `LIST_TEXT`, không chép lần hai.
export const DONE_TEXT = {
  // Dùng lại của F2
  loading: DETAIL_TEXT.loading,
  notFound: DETAIL_TEXT.notFound,
  forbidden: DETAIL_TEXT.forbidden,
  backToList: DETAIL_TEXT.backToList,
  service: DETAIL_TEXT.service,
  doctor: DETAIL_TEXT.doctor,
  branch: DETAIL_TEXT.branch,
  person: DETAIL_TEXT.person,
  price: DETAIL_TEXT.price,
  deposit: DETAIL_TEXT.deposit,
  paid: DETAIL_TEXT.paid,
  counter: DETAIL_TEXT.counter,
  sessionExpired: LIST_TEXT.sessionExpired,
  ownPerson: LIST_TEXT.ownPerson,
  relativePerson: LIST_TEXT.relativePerson,

  // Figma `453:2`
  successTitle: 'Đặt lịch thành công',
  successNote: 'Lịch hẹn đã được xác nhận. Vui lòng đến đúng giờ.',
  codeLabel: 'Mã lịch hẹn',
  detailsTitle: 'Chi tiết lịch hẹn',
  visitDateTime: 'Ngày & giờ khám',
  costTitle: 'Chi phí',
  counterNote: 'Phần còn lại thu tại quầy trước khi tiếp đón',
  home: 'Về trang chủ',
  myAppointments: 'Xem lịch hẹn của tôi',

  // [đề xuất]
  nextLabel: 'Việc tiếp theo',
  pendingTitle: 'Lịch hẹn đang chờ thanh toán cọc',
  pendingNote: 'Lịch hẹn chỉ được xác nhận sau khi thanh toán cọc.',
  payNow: 'Tiếp tục thanh toán',
  statusTitle: 'Trạng thái lịch hẹn',
  unknownState: 'Chưa xác định được trạng thái của lịch hẹn này.',
} as const;

// Một câu cho mỗi trạng thái "đã qua bước đặt" (không dựng phiếu "thành công" cho chúng) [đề xuất]
export const ENDED_SENTENCES = {
  DaHuy: 'Lịch hẹn này đã được hủy.',
  VangMat: 'Lịch hẹn này đã được ghi nhận vắng mặt.',
  HoanThanh: 'Lịch hẹn này đã hoàn thành.',
  DaTiepDon: 'Lịch hẹn này đã được tiếp đón.',
} as const;
