import type { ArticleStatus } from '../api/article-types';
import { ARTICLE_ERROR } from '../common/article-errors';

// MỌI chữ cố định của trang quản trị bài viết ở MỘT chỗ (nếp `reviews-text.ts`). Nguồn: PLAN article 5.11 và 5.3 (nguyên văn), cộng danh sách chữ 5.B
// do Đại duyệt 28/11/2026 (T1 đến T25 ở `plan_article_f1.md`; Đại vẫn sửa được lúc review PR). Chữ lỗi theo mã (PLAN 5.8) nằm ở `common/article-errors.ts`.
// Chữ chung đã có ở `shared/api/error-message.ts` (mất mạng, hết giờ, lỗi chung) và `ErrorState` ("Thử lại") không lặp lại ở đây.

export const STATUS_LABEL: Record<ArticleStatus, string> = {
  BanNhap: 'Bản nháp',
  DaXuatBan: 'Đã xuất bản',
  LuuTruAn: 'Lưu trữ',
};

export const LIST_TEXT = {
  title: 'Bài viết',
  newButton: 'Viết bài mới',
  loading: 'Đang tải danh sách bài viết…',
  searchLabel: 'Tìm theo tiêu đề',
  searchPlaceholder: 'Tìm theo tiêu đề…',
  chipGroupLabel: 'Lọc theo trạng thái',
  chipAll: 'Tất cả',
  tagFilterLabel: 'Lọc theo thẻ',
  tagFilterPlaceholder: 'Nhập tên thẻ, nhấn Enter',
  clearTagFilter: 'Bỏ lọc thẻ',
  tableLabel: 'Danh sách bài viết',
  columnTitle: 'Tiêu đề',
  columnStatus: 'Trạng thái',
  columnTags: 'Thẻ',
  columnPublished: 'Ngày xuất bản',
  columnUpdated: 'Cập nhật',
  columnActions: 'Thao tác',
  emptyPlain: 'Chưa có bài viết nào.',
  emptyFiltered: 'Không tìm thấy bài viết phù hợp.',
  edit: 'Sửa',
  publish: 'Xuất bản',
  archive: 'Lưu trữ (ẩn bài)',
  restore: 'Khôi phục về Bản nháp',
  published: 'Đã xuất bản bài viết.',
  archived: 'Đã lưu trữ bài viết.',
  restored: 'Đã khôi phục bài viết về Bản nháp.',
  forbidden: 'Bạn không có quyền thay đổi bài viết.',
  notFound: 'Bài viết không còn tồn tại.',
  failed: 'Không đổi được trạng thái bài viết. Vui lòng thử lại.',
} as const;

// Hộp xác nhận ẩn bài (A2): nguyên văn PLAN 5.11
export const ARCHIVE_DIALOG = {
  title: 'Lưu trữ bài viết?',
  message:
    'Bài viết sẽ không còn hiển thị công khai, kể cả trong tra cứu. Lượt Thích và Không thích vẫn được giữ.',
  cancel: 'Huỷ',
  confirm: 'Lưu trữ',
} as const;

// Hộp rời trang khi còn thay đổi chưa lưu: cùng chữ với trang Cài đặt hệ thống
export const LEAVE_DIALOG = {
  title: 'Rời khỏi trang?',
  message: 'Các thay đổi chưa lưu sẽ bị mất.',
  confirm: 'Rời khỏi trang',
  cancel: 'Ở lại',
} as const;

export const FORM_TEXT = {
  createTitle: 'Viết bài mới',
  editTitle: 'Sửa bài viết',
  back: 'Quay lại danh sách',
  loading: 'Đang tải bài viết…',
  notFoundTitle: 'Không tìm thấy bài viết',
  notFoundBody: 'Bài viết không tồn tại hoặc đã bị gỡ.',
  titleLabel: 'Tiêu đề',
  summaryLabel: 'Mô tả ngắn',
  contentLabel: 'Nội dung',
  tagsLabel: 'Thẻ',
  statusLabel: 'Trạng thái',
  contentHint:
    'Cách nhau một dòng trống là một đoạn. Dòng bắt đầu bằng ## là tiêu đề phụ; các dòng bắt đầu bằng - là danh sách.',
  tagPlaceholder: 'Nhập thẻ, nhấn Enter hoặc dấu phẩy để thêm',
  tagSuggestionsLabel: 'Gợi ý thẻ',
  save: 'Lưu',
  saving: 'Đang lưu…',
  preview: 'Xem trước',
  hidePreview: 'Ẩn xem trước',
  previewLabel: 'Xem trước bài viết',
  previewEmpty: 'Chưa có nội dung để xem trước.',
  saved: 'Đã lưu bài viết.',
  idle: 'Chưa có thay đổi nào.',
  dirty: 'Có thay đổi chưa lưu.',
  noChange: 'Không có thay đổi nào để lưu.',
  forbidden: 'Bạn không có quyền sửa bài viết.',
  notFound: 'Bài viết không còn tồn tại.',
  // POST không tự thử lại được: không biết máy chủ đã ghi hay chưa (nếp `NetworkError` ở `shared/api/errors.ts`)
  unknownCreate:
    'Chưa rõ bài viết đã được lưu hay chưa. Hãy kiểm tra danh sách bài viết trước khi lưu lại.',
} as const;

// Câu thay thế khi lỗi 409 về thẻ thiếu `chiTiet.theDaCo` (không điền được tên thẻ)
export const TAG_FALLBACK_TEXT: Partial<Record<string, string>> = {
  [ARTICLE_ERROR.tagAccentConflict]:
    'Đã có thẻ cùng tên khác dấu. Hãy dùng thẻ đã có.',
  [ARTICLE_ERROR.tagDisabled]: 'Thẻ này đã bị tắt, chưa dùng lại được.',
};

export const authorLine = (name: string) => `Tác giả: ${name}`;
export const chipLabel = (label: string, count: number | null) =>
  count === null ? label : `${label} (${count})`;
// Tên truy cập của nút ở từng dòng: chữ nhìn thấy đứng đầu, rồi tên bài (đọc màn hình biết nút thuộc bài nào)
export const rowActionName = (label: string, title: string) =>
  `${label} bài viết ${title}`;
export const removeTagLabel = (tag: string) => `Bỏ thẻ ${tag}`;
export const formatCounter = (value: number, max: number) =>
  `${value.toLocaleString('vi-VN')} / ${max.toLocaleString('vi-VN')}`;
export const tagCounter = (count: number, max: number) =>
  `${count} / ${max} thẻ`;
