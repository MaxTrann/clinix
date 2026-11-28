import { ARTICLE_LIST_PATH, isArticleId } from '../common/article-paths';
import { slugify } from '../common/slug';

// Đường dẫn chi tiết `/cam-nang/:idSlug` (PLAN article Q3, T3): mã bài đứng đầu, slug chỉ để trang trí và đọc được; máy chủ chỉ nhận mã.
export const ARTICLE_DETAIL_PARAM = 'idSlug';

// Tách `12-sot-xuat-huyet` thành mã và slug. Sai dạng (`abc`, `0`, `012`, `12abc`, `-12`) ⇒ null và trang KHÔNG gọi API (ABG-06).
export function parseIdSlug(raw: string): { id: string; slug: string } | null {
  const dash = raw.indexOf('-');
  const id = dash === -1 ? raw : raw.slice(0, dash);
  if (!isArticleId(id)) return null;
  return { id, slug: dash === -1 ? '' : raw.slice(dash + 1) };
}

// Đoạn chuẩn `id-slug`; tiêu đề không còn chữ nào sau khi bỏ dấu thì chỉ còn mã bài
export function articleIdSlug(id: string, title: string): string {
  const slug = slugify(title);
  return slug === '' ? id : `${id}-${slug}`;
}

export function articleDetailPath(id: string, title: string): string {
  return `${ARTICLE_LIST_PATH}/${articleIdSlug(id, title)}`;
}
