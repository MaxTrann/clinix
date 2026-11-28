import {
  ARTICLE_SEARCH_MAX_LENGTH,
  isArticleStatus,
  type ArticleStatus,
} from '../api/article-types';
import { normalizeHashtag } from '../common/hashtag-name';

// Bộ lọc của danh sách quản trị nằm ở URL `?q=&trangThai=&the=&trang=` (PLAN article T22): tải lại và nút Quay lại không mất bộ lọc.
// Hàm thuần: đọc giá trị rác thì quay về mặc định, không ném lỗi.
export interface ArticleListFilters {
  q: string;
  trangThai: ArticleStatus | null;
  // Tên thẻ đã chuẩn hoá, '' khi không lọc
  the: string;
  trang: number;
}

const LONE_HIGH_SURROGATE = /[\uD800-\uDBFF]$/;
const PAGE_PATTERN = /^[1-9]\d{0,5}$/;

// Từ khoá gửi đi: bỏ khoảng trắng hai đầu, tối đa 100 đơn vị (máy chủ trả 400 nếu dài hơn), không để lại nửa cặp thay thế (emoji bị cắt giữa)
export function normalizeKeyword(raw: string): string {
  let text = raw.trim().slice(0, ARTICLE_SEARCH_MAX_LENGTH);
  if (LONE_HIGH_SURROGATE.test(text)) text = text.slice(0, -1);
  return text.trim();
}

export function readListFilters(params: URLSearchParams): ArticleListFilters {
  const status = params.get('trangThai');
  const tag = normalizeHashtag(params.get('the') ?? '');
  const page = params.get('trang') ?? '';
  return {
    q: normalizeKeyword(params.get('q') ?? ''),
    trangThai: isArticleStatus(status) ? status : null,
    the: tag.ok ? tag.name : '',
    trang: PAGE_PATTERN.test(page) ? Number(page) : 1,
  };
}

// Giá trị mặc định (không lọc, trang 1) không ghi lên URL
export function writeListFilters(filters: ArticleListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q !== '') params.set('q', filters.q);
  if (filters.trangThai !== null) params.set('trangThai', filters.trangThai);
  if (filters.the !== '') params.set('the', filters.the);
  if (filters.trang > 1) params.set('trang', String(filters.trang));
  return params;
}

export function hasActiveFilters(filters: ArticleListFilters): boolean {
  return filters.q !== '' || filters.trangThai !== null || filters.the !== '';
}
