// MỌI chữ cố định của trang công khai bài viết ở MỘT chỗ (nếp `admin/article-text.ts`). Nguồn: PLAN article 5.12 và 5.8 (nguyên văn, đã chốt) cộng danh sách chữ
// C1 đến C12 và bố cục do Đại duyệt ngày 28/11/2026 (hộp câu hỏi ở cửa sổ làm F2; Đại vẫn sửa được lúc review PR).
// Chữ chung đã có ở `shared/api/error-message.ts` (mất mạng, hết giờ, lỗi chung), `ErrorState` ("Thử lại") và `NotFoundCard` không lặp lại ở đây.
export const SITE_NAME = 'CLINIX';

export const PUBLIC_TEXT = {
  // Đã chốt (5.12): tiêu đề trang, mục menu, tiêu đề khối trang chủ
  title: 'Cẩm nang sức khỏe',
  menu: 'Cẩm nang',
  // C1: phụ đề trang danh sách (cũng là mô tả dưới tiêu đề khối trang chủ và `meta description` của danh sách)
  subtitle: 'Kiến thức y tế hữu ích từ đội ngũ chuyên gia CLINIX',
  // C5: đường dẫn
  breadcrumbLabel: 'Đường dẫn',
  breadcrumbHome: 'Trang chủ',
  // C2: ô tìm
  searchLabel: 'Tìm theo tiêu đề',
  searchPlaceholder: 'Tìm theo tiêu đề…',
  // C3: nhóm chip thẻ
  tagGroupLabel: 'Lọc theo thẻ',
  // C6: chữ khi đang tải
  loading: 'Đang tải bài viết…',
  // Đã chốt (A1, 5.8): danh sách rỗng và nút bỏ lọc
  empty: 'Không tìm thấy bài viết phù hợp.',
  clearFilters: 'Xoá bộ lọc',
  // C4: phân trang (nếp `search/doctors/doctor-results.tsx`)
  paginationLabel: 'Phân trang',
  prevPage: 'Trang trước',
  nextPage: 'Trang sau',
  // Đã chốt (A2, 5.8): bài không còn xem được
  unavailable: 'Bài viết không còn tồn tại hoặc đã được gỡ.',
  backToList: 'Quay lại Cẩm nang',
  // C12: nhóm thẻ ở trang chi tiết
  articleTagsLabel: 'Thẻ bài viết',
  // Đã chốt (5.12): liên kết khối trang chủ
  viewAll: 'Xem tất cả',
} as const;

// C5: mục cuối của đường dẫn ở trang danh sách là chữ của menu
export const pageIndicator = (page: number, last: number) =>
  `Trang ${page}/${last}`;
// C9: ngày ở trang chi tiết (thẻ bài chỉ ghi `dd/MM/yyyy`)
export const publishedOn = (date: string) => `Đăng ngày ${date}`;
// C7: tiêu đề tab
export const pageTitle = (title: string) => `${title} | ${SITE_NAME}`;
// C3: chữ chip thẻ
export const tagLabel = (tag: string) => `#${tag}`;
