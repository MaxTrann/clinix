// MỌI chữ cố định của khối "Bài viết có ích không?" ở MỘT chỗ (nếp `public/article-public-text.ts`, `admin/article-text.ts`). Nằm trong `rating/` chứ không gộp vào file chữ của `public/`:
// `rating/` không được import `public/` (luật ABU-08), mà `public/` lại import `rating/`, nên import ngược sẽ thành vòng.
// Nguồn: PLAN article 5.13 và 5.12 (đã chốt: tên nhóm, hai nút, lời nhắc đăng nhập, câu bài không còn); chữ còn lại do Đại duyệt ngày 28/11/2026 (hộp câu hỏi ở cửa sổ làm F3).
// Chữ lỗi mạng, hết giờ, lỗi chung và "Thử lại" đã có ở `shared/` (`errorMessageFor`, `ErrorState`) nên không lặp lại ở đây.
export const RATING_TEXT = {
  // Đã chốt (5.13, ABU-07): tên của nhóm, hiện ở MỌI chế độ (kể cả vai chỉ xem số đếm)
  groupLabel: 'Bài viết có ích không?',
  // Đã chốt (5.13): tên hai nút
  like: 'Thích',
  dislike: 'Không thích',
  // Đã chốt (MH14): lời nhắc cho khách; cả câu là MỘT liên kết tới trang đăng nhập (Đại duyệt)
  loginPrompt: 'Đăng nhập để đánh giá',
  // Đã chốt (5.12, use case 2.4.22 A1): bài đã bị gỡ. Lặp chữ của `PUBLIC_TEXT.unavailable` vì `rating/` không import `public/` (có ca test khoá hai câu bằng nhau)
  unavailable: 'Bài viết không còn tồn tại hoặc đã được gỡ.',
} as const;

// Tên đọc của nút: số đếm nằm TRONG tên (ABU-07), ví dụ "Thích (12)"
export const likeLabel = (count: number) => `${RATING_TEXT.like} (${count})`;
export const dislikeLabel = (count: number) =>
  `${RATING_TEXT.dislike} (${count})`;

// Chế độ chỉ xem số đếm (vai khác Bệnh nhân, lúc phiên chưa rõ): "12 lượt Thích", "3 lượt Không thích"
export const likeCount = (count: number) => `${count} lượt ${RATING_TEXT.like}`;
export const dislikeCount = (count: number) =>
  `${count} lượt ${RATING_TEXT.dislike}`;
