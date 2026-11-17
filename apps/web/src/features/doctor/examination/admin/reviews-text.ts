import { ApiError } from '../../../../shared/api/errors';
import type { AdminReviewStatus } from '../api/admin-review-types';
import { formatCount } from '../exam-messages';
import { HIDE_REASON_MAX, HIDE_REASON_MIN } from './hide-rules';

// Chữ của trang "Kiểm duyệt đánh giá" của Quản trị viên (doctor-exam F7; Figma `514:2`, `570:2`, `633:2`; PLAN 5.14). Chữ có trong Figma: tiêu đề, "Toàn hệ thống", "Chi nhánh: <tên>", "hiển thị", "đã ẩn", nhãn lọc, chữ trong ô lọc, tên cột,
// "Hiển thị", "Đã ẩn", `Xem`, "Chi tiết đánh giá", nhãn các trường của hộp, `Đóng`. Còn lại là [đề xuất] ĐÃ ĐƯỢC ĐẠI DUYỆT trực tiếp 17/11/2026 (Figma không có frame cho các trạng thái này). Lỗi mạng, hết giờ, chung: câu của `shared/api/error-message`.
export const REVIEWS_TEXT = {
  title: 'Kiểm duyệt đánh giá',
  systemScope: 'Toàn hệ thống',
  chipsLabel: 'Số đánh giá theo trạng thái',
  shownChip: 'hiển thị',
  hiddenChip: 'đã ẩn',
  tableLabel: 'Đánh giá bác sĩ',
  searchLabel: 'Tìm kiếm',
  searchPlaceholder: 'Tên bệnh nhân hoặc nội dung...',
  branchLabel: 'Chi nhánh',
  allBranches: 'Tất cả chi nhánh',
  doctorLabel: 'Bác sĩ',
  allDoctors: 'Tất cả bác sĩ',
  starsLabel: 'Số sao',
  statusLabel: 'Trạng thái',
  all: 'Tất cả',
  doctorsFailed: 'Không tải được danh sách bác sĩ.',
  loading: 'Đang tải đánh giá…',
  emptyPlain: 'Chưa có đánh giá nào.',
  emptyFiltered: 'Không có đánh giá nào khớp bộ lọc.',
  // Tên người đặt rỗng (dữ liệu mẫu hỏng, L9) và nhận xét rỗng: không bịa nội dung
  none: '—',
  action: 'Thao tác',
  view: 'Xem',
} as const;

// Dòng phụ của Admin Chi nhánh (Figma `633:272`): "Chi nhánh: CLINIX Chi nhánh Quận 3"
export const branchScopeText = (name: string): string => `Chi nhánh: ${name}`;

export const COLUMN_TEXT = {
  doctor: 'Bác sĩ',
  branch: 'Chi nhánh',
  patient: 'Bệnh nhân',
  stars: 'Sao',
  comment: 'Nội dung',
  sentDate: 'Ngày gửi',
  status: 'Trạng thái',
} as const;

export const DETAIL_TEXT = {
  title: 'Chi tiết đánh giá',
  appointment: 'Lịch hẹn',
  sentDate: 'Ngày gửi',
  stars: 'Số sao',
  comment: 'Nội dung',
  hiddenReason: 'Lý do ẩn',
  loading: 'Đang tải chi tiết…',
  notFound: 'Không tìm thấy đánh giá này.',
  close: 'Đóng',
} as const;

export const STATUS_TEXT: Record<AdminReviewStatus, string> = {
  HienThi: 'Hiển thị',
  DaAn: 'Đã ẩn',
};

// "Xem đánh giá của <tên> về <bác sĩ>"; tên người đặt rỗng ⇒ bỏ cụm "của …" (không in dấu gạch ngang vào tên truy cập)
export function viewLabel(author: string, doctor: string): string {
  return author.trim() === ''
    ? `${REVIEWS_TEXT.view} đánh giá về ${doctor}`
    : `${REVIEWS_TEXT.view} đánh giá của ${author} về ${doctor}`;
}

// Chữ của hộp "Ẩn đánh giá" và thông báo sau thao tác (doctor-exam F8; Figma `571:2`; PLAN 5.14). Chữ có trong Figma: `title`, `warning`, `reasonLabel`, `placeholder`, `cancel`, `confirm`, `hide` (nút `Ẩn` ở hàng, `514:439`),
// `hideReview` (nút ở chân hộp chi tiết, `570:916`). Có trong PLAN 5.14: `required`, `rejected`, `already`, `busy`. Còn lại là [đề xuất] ĐÃ ĐƯỢC ĐẠI DUYỆT trực tiếp 17/11/2026 (Figma không có khung cho bộ đếm, lỗi theo ô, đang gửi, thành công, "chưa rõ").
// `sessionExpired`, `forbidden` chép chữ của F1, F3, F6 (cùng câu cho cùng mã lỗi). Số trong chữ lấy từ hằng của `hide-rules.ts` (MỘT nơi).
export const HIDE_TEXT = {
  title: 'Ẩn đánh giá',
  warning:
    'Đánh giá sẽ không còn hiển thị công khai nhưng vẫn được lưu trong hệ thống để truy vết. Hành động này sẽ được ghi vào Nhật ký hành động.',
  reasonLabel: 'Lý do ẩn',
  placeholder: `Nhập lý do ẩn đánh giá (tối thiểu ${HIDE_REASON_MIN} ký tự)...`,
  cancel: 'Hủy',
  confirm: 'Xác nhận ẩn',
  hiding: 'Đang ẩn...',
  hide: 'Ẩn',
  hideReview: 'Ẩn đánh giá',
  required: 'Vui lòng nhập lý do ẩn.',
  tooShort: `Lý do ẩn cần ít nhất ${HIDE_REASON_MIN} ký tự.`,
  tooLong: `Tối đa ${formatCount(HIDE_REASON_MAX)} ký tự.`,
  rejected: 'Nội dung có đoạn giống mật khẩu hoặc mã bí mật; hãy viết lại.',
  hidden: 'Đã ẩn đánh giá.',
  already: 'Đánh giá này đã được ẩn.',
  notFound: DETAIL_TEXT.notFound,
  reloaded: 'Đã tải lại danh sách.',
  reload: 'Tải lại danh sách',
  busy: 'Hệ thống đang bận, thử lại sau ít phút.',
  sessionExpired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  unsure:
    'Chưa rõ đánh giá đã được ẩn chưa (mất kết nối hoặc quá thời gian chờ). Lý do của bạn vẫn còn ở đây.',
} as const;

// "Ẩn đánh giá của <tên> về <bác sĩ>"; tên người đặt rỗng ⇒ bỏ cụm "của …" (như `viewLabel`)
export function hideLabel(author: string, doctor: string): string {
  return author.trim() === ''
    ? `${HIDE_TEXT.hideReview} về ${doctor}`
    : `${HIDE_TEXT.hideReview} của ${author} về ${doctor}`;
}

// Chữ thay thế khi chuỗi rỗng hay chỉ khoảng trắng
export const orNone = (text: string | null): string =>
  text === null || text.trim() === '' ? REVIEWS_TEXT.none : text;

// 404 `KHONG_TIM_THAY` của chi tiết (đánh giá không có, sai dạng id, hoặc ngoài phạm vi: máy chủ trả CÙNG một thân)
export function isReviewNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.maLoi === 'KHONG_TIM_THAY';
}
