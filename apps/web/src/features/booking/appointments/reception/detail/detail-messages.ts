import { COMMON_LIST_TEXT } from '../../common/list-text';

// Chữ của ngăn chi tiết lịch hẹn của Lễ tân (booking F8). Chữ của Figma `488:2`, `495:2` đến `497:2` khi có (tiêu đề ba khối, nhãn dòng, `Danh sách`, tên nút); còn lại là
// [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho `Đã hủy`, `Vắng mặt`, `Chờ thanh toán`, lỗi, đang tải: PLAN 4.5). Đã bỏ `Email` (API không trả, Q32) và `Kênh đặt` (Q37).
export const DETAIL_TEXT = {
  dialogPrefix: 'Chi tiết lịch hẹn ',
  back: 'Danh sách',
  // Figma không có nút đóng (chỉ có liên kết `Danh sách`): nút X và Esc là [đề xuất] cho trợ năng (Đại duyệt 12/11/2026)
  close: 'Đóng',
  loading: 'Đang tải chi tiết lịch hẹn...',
  notFound: 'Không tìm thấy lịch hẹn này.',
  sessionExpired: COMMON_LIST_TEXT.sessionExpired,
  forbidden: 'Bạn không có quyền xem lịch hẹn này.',
  sections: {
    patient: 'THÔNG TIN BỆNH NHÂN',
    doctor: 'BÁC SĨ & CHUYÊN KHOA',
    appointment: 'CHI TIẾT LỊCH HẸN',
  },
  rows: {
    name: 'Họ tên',
    booker: 'Người đặt',
    phone: 'Số điện thoại',
    reason: 'Lý do khám',
    doctor: 'Bác sĩ',
    specialty: 'Chuyên khoa',
    service: 'Dịch vụ',
    price: 'Giá khám',
    code: 'Mã lịch',
    date: 'Ngày khám',
    branch: 'Chi nhánh',
    deposit: 'Tiền cọc',
    paymentDeadline: 'Hạn thanh toán',
    cancelReason: 'Lý do hủy',
    due: 'Còn phải thu',
  },
  ownPerson: 'Bản thân',
  relativePerson: 'Người thân',
  bookerPhone: 'Của người đặt',
  noReason: 'Không ghi lý do',
  actionsGroup: 'Thao tác',
  // Nút chưa có hành động tới F9 (B12 chưa merge): vô hiệu kèm chữ ẩn cho trình đọc màn hình
  notImplementedHidden: '(chưa được triển khai)',
  // `Thu tiền & tiếp đón` thuộc `payment` (LTN-05): vô hiệu kèm chữ HIỆN
  notImplemented: 'Chưa được triển khai',
} as const;

// Dòng phụ dưới mã lịch, Figma "18/10 lúc 08:00"
export const whenLabel = (shortDate: string, time: string) =>
  `${shortDate} lúc ${time}`;

// "Ngày khám" và "Hạn thanh toán": "Thứ 3, 20/10/2026 · 08:00" (Figma ghi "18/10 · 08:00"; thêm thứ và năm vì API có đủ: [đề xuất])
export const dateTimeLabel = (weekdayDate: string, time: string) =>
  `${weekdayDate} · ${time}`;
