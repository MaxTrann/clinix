import { ROLE_HOME_PATHS } from '../../../auth';

// Đường dẫn trang "Kiểm duyệt đánh giá" của Quản trị viên (doctor-exam F7; PLAN 5.13): `/admin/kiem-duyet-danh-gia`. Mục menu ở `features/admin/components/admin-sidebar.tsx` ghi đường dẫn gốc bằng chữ (không import chéo);
// test WKD-01 giữ hai nơi khớp nhau (cùng nếp `approvals-paths.ts`).
export const ADMIN_REVIEWS_SEGMENT = 'kiem-duyet-danh-gia';
export const ADMIN_REVIEWS_PATH = `${ROLE_HOME_PATHS.QuanTriVien}/${ADMIN_REVIEWS_SEGMENT}`;
