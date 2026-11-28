// Bề mặt công khai của module bài viết (PLAN article 5.1): `router/` chỉ import từ đây. KHÔNG xuất `testing/`.
// F1: route quản trị (đã bọc `AdminScopeGuard` ToanHeThong), ghép vào khối `QuanTriVien` ở `router/role-routes.tsx`; hằng đường dẫn danh sách công khai cho menu "Cẩm nang" của F2.
// F2: route công khai (ghép trong khung `PublicLayout` ở `router/routes.tsx`) và khối "Cẩm nang sức khỏe" của trang chủ (truyền vào khe `handbookSlot` của `HomePage`).
export { ARTICLE_ADMIN_ROUTES } from './admin/article-routes';
export { ARTICLE_LIST_PATH } from './common/article-paths';
export { ARTICLE_PUBLIC_ROUTES } from './public/article-public-routes';
export { HomeHandbookSection } from './public/home-handbook-section';
