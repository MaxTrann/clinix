import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import type { NotificationGroup, ReadFilter } from '../api/notification-types';

// Câu chữ của trang Trung tâm thông báo (notification F2; PLAN 5.11, Đại đồng ý ở Q15, nhóm duyệt khi review). Chọn câu lỗi theo `maLoi`, không theo câu của máy chủ.

export const CENTER_TEXT = {
  title: 'Thông báo',
  tabsLabel: 'Lọc thông báo',
  markAll: 'Đánh dấu tất cả đã đọc',
  markAllPending: 'Đang đánh dấu…',
  markAllFailed: 'Chưa đánh dấu được tất cả. Thử lại sau.',
  markOneFailed: 'Chưa đánh dấu được là đã đọc. Thử lại sau.',
  loading: 'Đang tải thông báo',
  retry: 'Thử lại',
  back: 'Quay lại',
  listLabel: 'Danh sách thông báo',
  detailLabel: 'Chi tiết thông báo',
  unreadMark: 'Chưa đọc',
  pastEnd: 'Trang này không còn thông báo.',
  toLastPage: 'Về trang cuối',
  paginationLabel: 'Phân trang thông báo',
  previousPage: 'Trang trước',
  nextPage: 'Trang sau',
  pageOf: (page: number, count: number) => `Trang ${page}/${count}`,
  chooseHint: 'Chọn một thông báo để xem chi tiết.',
} as const;

export const FILTER_LABELS: Record<ReadFilter, string> = {
  'tat-ca': 'Tất cả',
  'chua-doc': 'Chưa đọc',
  'da-doc': 'Đã đọc',
};

export const EMPTY_TEXT: Record<ReadFilter, string> = {
  'tat-ca': 'Bạn chưa có thông báo nào.',
  'chua-doc': 'Bạn không có thông báo chưa đọc.',
  'da-doc': 'Bạn chưa có thông báo đã đọc.',
};

/** Nhãn nhóm trong panel chi tiết; mã lạ (`nhom: null`) ghi "Khác" `[đề xuất]`. */
export const GROUP_LABELS: Record<NotificationGroup | 'Khac', string> = {
  LichHen: 'Lịch hẹn',
  DoiLich: 'Đổi lịch',
  NghiPhep: 'Nghỉ phép',
  Vi: 'Ví',
  ChiNhanh: 'Chi nhánh',
  Khac: 'Khác',
};

/** Chữ của nút liên kết trong panel, theo kiểu `[đề xuất]`. */
export const LINK_LABELS = {
  LichHen: 'Xem lịch hẹn',
  Vi: 'Xem ví',
  NghiPhep: 'Xem nghỉ phép',
  ThayDoiChiNhanh: 'Xem trang liên quan',
} as const;

export const LOAD_ERROR_TEXT = {
  invalid: 'Bộ lọc không hợp lệ. Vui lòng tải lại trang.',
  notFound: 'Không tìm thấy thông báo này.',
  server: 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
  network: 'Không tải được thông báo. Kiểm tra kết nối rồi thử lại.',
} as const;

/** Câu lỗi khi tải danh sách (PLAN 5.11). */
export function loadErrorMessage(error: unknown): string {
  if (error instanceof NetworkError || error instanceof TimeoutError)
    return LOAD_ERROR_TEXT.network;
  if (error instanceof ApiError) {
    if (error.maLoi === 'DU_LIEU_KHONG_HOP_LE') return LOAD_ERROR_TEXT.invalid;
    if (error.maLoi === 'KHONG_TIM_THAY') return LOAD_ERROR_TEXT.notFound;
  }
  return LOAD_ERROR_TEXT.server;
}
