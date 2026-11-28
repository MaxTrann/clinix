import { ARTICLE_SEARCH_MAX_LENGTH } from '../api/article-types';
import { ARTICLE_LIST_PATH } from '../common/article-paths';
import { normalizeHashtag } from '../common/hashtag-name';

// Bộ lọc của danh sách công khai nằm ở URL `?q=&the=&trang=` (PLAN article 5.12, ABG-03): tải lại và nút Quay lại không mất bộ lọc.
// Hàm thuần: đọc giá trị rác thì quay về mặc định, không ném lỗi. Cùng khuôn với bộ lọc của trang quản trị nhưng KHÔNG import từ `admin/` (ABG-13).
export interface PublicListFilters {
  q: string;
  // Tên thẻ đã chuẩn hoá, '' khi không lọc. Gửi lên máy chủ chỉ khi khác rỗng (máy chủ từ chối `the` rỗng).
  the: string;
  trang: number;
}

const LONE_HIGH_SURROGATE = /[\uD800-\uDBFF]$/;
const PAGE_PATTERN = /^[1-9]\d{0,5}$/;

// Từ khoá gửi đi: bỏ khoảng trắng hai đầu, tối đa 100 đơn vị UTF-16 (máy chủ trả 400 nếu dài hơn), không để lại nửa cặp thay thế (emoji bị cắt giữa)
export function normalizeKeyword(raw: string): string {
  let text = raw.trim().slice(0, ARTICLE_SEARCH_MAX_LENGTH);
  if (LONE_HIGH_SURROGATE.test(text)) text = text.slice(0, -1);
  return text.trim();
}

export function readPublicFilters(params: URLSearchParams): PublicListFilters {
  const tag = normalizeHashtag(params.get('the') ?? '');
  const page = params.get('trang') ?? '';
  return {
    q: normalizeKeyword(params.get('q') ?? ''),
    the: tag.ok ? tag.name : '',
    trang: PAGE_PATTERN.test(page) ? Number(page) : 1,
  };
}

// Giá trị mặc định (không lọc, trang 1) không ghi lên URL
export function writePublicFilters(
  filters: PublicListFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q !== '') params.set('q', filters.q);
  if (filters.the !== '') params.set('the', filters.the);
  if (filters.trang > 1) params.set('trang', String(filters.trang));
  return params;
}

export function hasPublicFilters(filters: PublicListFilters): boolean {
  return filters.q !== '' || filters.the !== '';
}

// Đường dẫn danh sách kèm bộ lọc, ví dụ thẻ ở trang chi tiết: `/cam-nang?the=s%E1%BB%91t-xu%E1%BA%A5t-huy%E1%BA%BFt` (URLSearchParams mã hoá, đọc ngược bằng `readPublicFilters`)
export function articleListPath(
  filters: Partial<PublicListFilters> = {},
): string {
  const search = writePublicFilters({
    q: '',
    the: '',
    trang: 1,
    ...filters,
  }).toString();
  return search === '' ? ARTICLE_LIST_PATH : `${ARTICLE_LIST_PATH}?${search}`;
}
