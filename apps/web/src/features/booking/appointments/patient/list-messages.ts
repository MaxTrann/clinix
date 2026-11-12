import { ApiError } from '../../../../shared/api/errors';
import { BOOKING_ERROR_CODES } from '../../api/booking-errors';

// Chữ của trang "Lịch hẹn của tôi" (booking F1). Chữ của Figma `411:2` khi có; còn lại là [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho rỗng, lỗi,
// đang tải, phân trang: PLAN 4.5). Phụ đề giữ nguyên chữ Figma dù nhắc "thanh toán cọc" (`payment` chưa có): nhóm quyết bỏ chữ đó sau.
export const LIST_TEXT = {
  title: 'Lịch hẹn của tôi',
  subtitle: 'Xem, thanh toán cọc hoặc hủy lịch khám của bạn và người thân.',
  bookButton: 'Đặt lịch khám',
  // Figma `411:2`: chữ mờ trong ô; tên truy cập của ô cùng nội dung
  searchLabel: 'Tìm theo mã lịch, bác sĩ, người khám',
  searchPlaceholder: 'Tìm theo mã lịch, bác sĩ, người khám',
  keywordTooShort: 'Nhập ít nhất 2 ký tự để tìm kiếm.',
  keywordTooLong: 'Từ khoá tối đa 100 ký tự.',
  keywordRejected: 'Từ khoá không hợp lệ. Vui lòng nhập từ khoá khác.',
  allOption: 'Tất cả',
  ownOption: 'Bản thân',
  inactiveRelativeSuffix: ' (ngừng sử dụng)',
  profileLabel: 'Người khám',
  doctorLabel: 'Bác sĩ',
  specialtyLabel: 'Chuyên khoa',
  fromLabel: 'Từ ngày',
  toLabel: 'Đến ngày',
  dateOrder: 'Đến ngày phải sau hoặc bằng Từ ngày.',
  optionsRetry: 'Thử lại',
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
  detailHiddenNote: ' (chưa được triển khai)',
  detailTitle: 'Chưa được triển khai',
  paginationLabel: 'Phân trang lịch hẹn',
  previousPage: 'Trang trước',
  nextPage: 'Trang sau',
  previous: 'Trước',
  next: 'Sau',
  sessionExpired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  forbidden: 'Bạn không có quyền xem danh sách này.',
} as const;

export const shownLabel = (shown: number, total: number) =>
  `Hiển thị ${shown} / ${total} lịch hẹn`;

export const pageLabel = (page: number, pageCount: number) =>
  `Trang ${page} / ${pageCount}`;

export const optionsFailedLabel = (what: string) =>
  `Không tải được danh sách ${what}.`;

export const optionsTruncatedLabel = (what: string) =>
  `Danh sách ${what} rút gọn: chỉ hiện 100 mục đầu.`;

// Mã `maLoi` mà trang xử lý riêng. `DU_LIEU_KHONG_HOP_LE` là mã chung của mọi lỗi kiểm dữ liệu: chỉ coi là lỗi từ khoá khi có `loi[].ma` tương ứng
const CODE_UNAUTHENTICATED = 'CHUA_DANG_NHAP';
const CODE_INVALID_INPUT = 'DU_LIEU_KHONG_HOP_LE';
const FIELD_CODE_INVALID_KEYWORD = 'TU_KHOA_KHONG_HOP_LE';

// Chọn câu theo `maLoi`, KHÔNG theo mã HTTP hay `thongBao` (CODING_CONVENTION). `other`: mạng, quá giờ, phản hồi lạ, 5xx, `maLoi` lạ (kể cả 400 và 409
// B1 không có): câu chung của `ErrorState` kèm `Thử lại`. `session` và `forbidden` không có `Thử lại` (cùng yêu cầu sẽ cùng kết quả).
export type ListErrorKind = 'keyword' | 'session' | 'forbidden' | 'other';

export function classifyListError(error: unknown): ListErrorKind {
  if (!(error instanceof ApiError)) return 'other';
  if (error.maLoi === CODE_UNAUTHENTICATED) return 'session';
  if (error.maLoi === BOOKING_ERROR_CODES.FORBIDDEN) return 'forbidden';
  if (
    error.maLoi === CODE_INVALID_INPUT &&
    error.loi?.some((item) => item.ma === FIELD_CODE_INVALID_KEYWORD)
  ) {
    return 'keyword';
  }
  return 'other';
}
