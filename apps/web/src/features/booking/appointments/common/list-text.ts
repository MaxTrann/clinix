// Chữ dùng chung của các trang DANH SÁCH lịch hẹn trong booking (F1 chuyển lên ở F8; F8, F10, F11 dùng lại). Chữ riêng của từng trang (tiêu đề, cột, câu
// rỗng) ở lại `list-messages.ts` của trang đó và trải `COMMON_LIST_TEXT` vào `LIST_TEXT` của mình, nên mọi chỗ đọc `LIST_TEXT.x` cũ vẫn chạy.
// Chữ của Figma khi có; còn lại là [đề xuất] (Figma chưa có frame cho rỗng, lỗi, đang tải, phân trang: PLAN 4.5).
export const COMMON_LIST_TEXT = {
  keywordTooShort: 'Nhập ít nhất 2 ký tự để tìm kiếm.',
  keywordTooLong: 'Từ khoá tối đa 100 ký tự.',
  keywordRejected: 'Từ khoá không hợp lệ. Vui lòng nhập từ khoá khác.',
  allOption: 'Tất cả',
  optionsRetry: 'Thử lại',
  fromLabel: 'Từ ngày',
  toLabel: 'Đến ngày',
  dateOrder: 'Đến ngày phải sau hoặc bằng Từ ngày.',
  paginationLabel: 'Phân trang lịch hẹn',
  previousPage: 'Trang trước',
  nextPage: 'Trang sau',
  previous: 'Trước',
  next: 'Sau',
  sessionExpired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  forbidden: 'Bạn không có quyền xem danh sách này.',
} as const;

export const pageLabel = (page: number, pageCount: number) =>
  `Trang ${page} / ${pageCount}`;

export const optionsFailedLabel = (what: string) =>
  `Không tải được danh sách ${what}.`;

export const optionsTruncatedLabel = (what: string) =>
  `Danh sách ${what} rút gọn: chỉ hiện 100 mục đầu.`;
