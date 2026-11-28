import { ROLE_HOME_PATHS } from '../../auth';

// Đường dẫn của module bài viết (PLAN article 5.11, T14, T18). Mục "Bài viết" ở thanh bên Admin
// (`features/admin/components/admin-sidebar.tsx`) ghi đường dẫn bằng chữ để không import chéo `features/`;
// test `article-paths.test.ts` giữ hai nơi khớp nhau từng chữ.
// `ARTICLE_LIST_PATH` là trang công khai (F2 dùng cho menu "Cẩm nang"); xuất qua `index.ts`.
export const ARTICLE_LIST_PATH = '/cam-nang';

export const ARTICLE_ADMIN_SEGMENT = 'bai-viet';
export const ARTICLE_ADMIN_NEW_SEGMENT = 'moi';
export const ARTICLE_ADMIN_PATH = `${ROLE_HOME_PATHS.QuanTriVien}/${ARTICLE_ADMIN_SEGMENT}`;
export const ARTICLE_ADMIN_NEW_PATH = `${ARTICLE_ADMIN_PATH}/${ARTICLE_ADMIN_NEW_SEGMENT}`;

export function articleAdminEditPath(id: string): string {
  return `${ARTICLE_ADMIN_PATH}/${encodeURIComponent(id)}`;
}

// Mã bài viết là BIGINT dương (chuỗi số, không số 0 đứng đầu, tối đa 19 chữ số). Sai dạng thì trang không gọi API.
const ARTICLE_ID_PATTERN = /^[1-9]\d{0,18}$/;

export function isArticleId(text: string): boolean {
  return ARTICLE_ID_PATTERN.test(text);
}
