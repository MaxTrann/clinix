import { COMMON_LIST_TEXT } from '../common/list-text';

// Chữ của trang "Lịch hẹn của tôi" (booking F1). Chữ của Figma `411:2` khi có; còn lại là [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho rỗng, lỗi,
// đang tải, phân trang: PLAN 4.5). Phụ đề giữ nguyên chữ Figma dù nhắc "thanh toán cọc" (`payment` chưa có): nhóm quyết bỏ chữ đó sau.
export const LIST_TEXT = {
  ...COMMON_LIST_TEXT,
  title: 'Lịch hẹn của tôi',
  subtitle: 'Xem, thanh toán cọc hoặc hủy lịch khám của bạn và người thân.',
  bookButton: 'Đặt lịch khám',
  // Figma `411:2`: chữ mờ trong ô; tên truy cập của ô cùng nội dung
  searchLabel: 'Tìm theo mã lịch, bác sĩ, người khám',
  searchPlaceholder: 'Tìm theo mã lịch, bác sĩ, người khám',
  ownOption: 'Bản thân',
  inactiveRelativeSuffix: ' (ngừng sử dụng)',
  profileLabel: 'Người khám',
  doctorLabel: 'Bác sĩ',
  specialtyLabel: 'Chuyên khoa',
  statusGroup: 'Lọc theo trạng thái',
  allStatuses: 'Tất cả',
  loading: 'Đang tải lịch hẹn...',
  noneYet: 'Bạn chưa có lịch hẹn nào.',
  noMatch: 'Không có lịch hẹn nào khớp bộ lọc.',
  clearFilters: 'Xóa bộ lọc',
  resultsRegion: 'Kết quả lịch hẹn',
  tableCaption: 'Danh sách lịch hẹn',
  columns: {
    appointment: 'Lịch hẹn',
    doctor: 'Bác sĩ',
    person: 'Người khám',
    price: 'Giá khám',
    status: 'Trạng thái',
    actions: 'Thao tác',
  },
  ownPerson: 'Bản thân',
  relativePerson: 'Người thân',
  detail: 'Chi tiết',
} as const;

// Chữ ẩn sau `Chi tiết` (booking F2): "Chi tiết lịch hẹn CP…", để người dùng trình đọc màn hình phân biệt các liên kết cùng tên trong bảng
export const detailLinkSuffix = (maLichHen: string) => ` lịch hẹn ${maLichHen}`;

export { shownLabel } from '../common/list-text';
