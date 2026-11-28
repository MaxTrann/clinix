// Kiểu dữ liệu quản trị bài viết theo hợp đồng PLAN article 5.7 (đã đối chiếu với kế hoạch B1 do phiên kiểm duyệt 28/11/2026). Mã bài là chuỗi (BIGINT);
// thời điểm là chuỗi ISO 8601 UTC. Khoá `moTaNgan`, `thoiDiemXuatBan`, `anhDaiDien` là `null` khi chưa có.
export const ARTICLE_STATUSES = ['BanNhap', 'DaXuatBan', 'LuuTruAn'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export function isArticleStatus(value: unknown): value is ArticleStatus {
  return ARTICLE_STATUSES.some((status) => status === value);
}

export interface ArticleAuthor {
  taiKhoanId: string;
  hoTen: string;
}

// Một dòng của danh sách quản trị (không có `noiDung`)
export interface ArticleListItem {
  baiVietId: string;
  tieuDe: string;
  moTaNgan: string | null;
  trangThai: ArticleStatus;
  thoiDiemXuatBan: string | null;
  thoiDiemTao: string | null;
  capNhatLanCuoi: string | null;
  tacGia: ArticleAuthor | null;
  // Tên thẻ (chuỗi), không phải đối tượng
  hashtag: string[];
  anhDaiDien: string | null;
}

export interface ArticleDetail extends ArticleListItem {
  noiDung: string;
}

export type ArticleStatusCounts = Record<ArticleStatus, number>;

export interface ArticleListPage {
  items: ArticleListItem[];
  total: number;
  page: number;
  pageSize: number;
  // Đếm theo trạng thái, tính trên mọi bộ lọc TRỪ `trangThai` (PLAN T20)
  demTheoTrangThai: ArticleStatusCounts;
}

export const ARTICLE_LIST_PAGE_SIZE = 20;
export const ARTICLE_SEARCH_MAX_LENGTH = 100;
export const TAG_SUGGESTION_LIMIT = 10;

export interface ArticleListQuery {
  q?: string;
  trangThai?: ArticleStatus;
  the?: string;
  page: number;
}

// Thân `POST admin/articles`: luôn gửi `noiDung` (chuỗi rỗng được khi là bản nháp) và `hashtag` (mảng rỗng được). Không tạo thẳng bài ở `LuuTruAn`.
export interface ArticleInput {
  tieuDe: string;
  moTaNgan?: string;
  noiDung: string;
  hashtag: string[];
  trangThai: 'BanNhap' | 'DaXuatBan';
}

// Thân `PATCH admin/articles/:id`: tập con của thân tạo, `trangThai` thêm `LuuTruAn`. `hashtag` có mặt ⇒ thay toàn bộ;
// `moTaNgan` là '' ⇒ xoá mô tả. Thân rỗng bị máy chủ từ chối (400), nên web không gọi khi không đổi gì.
export interface ArticlePatch {
  tieuDe?: string;
  moTaNgan?: string;
  noiDung?: string;
  hashtag?: string[];
  trangThai?: ArticleStatus;
}

// ----- Công khai (article F2; PLAN 5.7 "Công khai (B2)"; đã đối chiếu với mã B2 thật ở `83bd275`) -----
// Mọi khoá thời điểm là chuỗi ISO 8601 UTC; `thoiDiemXuatBan` là `null` khi dữ liệu lệch (bài đã xuất bản mà thiếu thời điểm, B2 ABP-12).
// `anhDaiDien` luôn có khoá nhưng hiện `null` (ảnh là việc của F4). Không có tác giả, không có trạng thái (chỉ bài `DaXuatBan`).
export interface PublicArticleItem {
  baiVietId: string;
  tieuDe: string;
  moTaNgan: string | null;
  anhDaiDien: string | null;
  thoiDiemXuatBan: string | null;
  // Chỉ thẻ đang hoạt động, sắp theo tên
  hashtag: string[];
}

// article F3: chi tiết công khai nay trả thêm hai số đếm (B3; số nguyên không âm, 0 khi chưa ai bấm). Thiếu hay sai kiểu ⇒ `UnexpectedResponseError`.
export interface PublicArticleDetail extends PublicArticleItem, RatingTotals {
  noiDung: string;
}

export interface PublicArticlePage {
  items: PublicArticleItem[];
  total: number;
  page: number;
  pageSize: number;
}

// Thẻ phổ biến cho chip lọc ở trang danh sách (tối đa 20; `soBai` giảm dần rồi tên)
export interface PublicArticleTag {
  ten: string;
  soBai: number;
}

// ----- Đánh giá Thích / Không thích (article F3; PLAN 5.7 "Đánh giá (B3)"; đã đối chiếu với mã B3 thật ở `1c6e901`) -----
export const RATING_CHOICES = ['Thich', 'KhongThich'] as const;
export type RatingChoice = (typeof RATING_CHOICES)[number];

export function isRatingChoice(value: unknown): value is RatingChoice {
  return RATING_CHOICES.some((choice) => choice === value);
}

// Số đếm do MÁY CHỦ tính; web không cộng trừ
export interface RatingTotals {
  luotThich: number;
  luotKhongThich: number;
}

// Thân trả về của `PUT` và `DELETE`: loại phiếu sau khi ghi (`null` sau khi thu hồi) kèm số đếm mới
export interface ArticleRatingResult extends RatingTotals {
  loai: RatingChoice | null;
}

// Máy chủ: mặc định 9, tối đa 30. Khối trang chủ lấy 4 bài mới nhất.
export const PUBLIC_LIST_PAGE_SIZE = 9;
export const HOME_HANDBOOK_SIZE = 4;

// `q` và `the` chỉ có mặt khi có giá trị: `the` RỖNG bị máy chủ từ chối (400 `BO_LOC_KHONG_HOP_LE`), nên web bỏ khoá khi không chọn thẻ.
export interface PublicArticleListQuery {
  q?: string;
  the?: string;
  page: number;
  pageSize?: number;
}
