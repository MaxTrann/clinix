import { ROLE_HOME_PATHS } from '../../../auth';

// Đường dẫn trang "Duyệt yêu cầu" của Quản trị viên (doctor F8, Q36): `/admin/duyet-yeu-cau` chuyển tới tab nghỉ phép. Mục menu ở
// `features/admin/components/admin-sidebar.tsx` ghi đường dẫn gốc bằng chữ (không import chéo); test WA- giữ hai nơi khớp nhau.
export const ADMIN_APPROVALS_SEGMENT = 'duyet-yeu-cau';
export const ADMIN_LEAVE_APPROVALS_SEGMENT = 'nghi-phep';
export const ADMIN_APPROVALS_PATH = `${ROLE_HOME_PATHS.QuanTriVien}/${ADMIN_APPROVALS_SEGMENT}`;
export const ADMIN_LEAVE_APPROVALS_PATH = `${ADMIN_APPROVALS_PATH}/${ADMIN_LEAVE_APPROVALS_SEGMENT}`;
