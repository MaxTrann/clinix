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
