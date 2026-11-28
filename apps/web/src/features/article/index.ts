// Bề mặt công khai của module bài viết (PLAN article 5.1): `router/` chỉ import từ đây. KHÔNG xuất `testing/`.
// F1: route quản trị (đã bọc `AdminScopeGuard` ToanHeThong), ghép vào khối `QuanTriVien` ở `router/role-routes.tsx`; hằng đường dẫn danh sách công khai cho menu "Cẩm nang" của F2.
export { ARTICLE_ADMIN_ROUTES } from './admin/article-routes';
export { ARTICLE_LIST_PATH } from './common/article-paths';
