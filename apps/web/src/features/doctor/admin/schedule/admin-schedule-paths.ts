import { ROLE_HOME_PATHS } from '../../../auth';

// Đường dẫn trang "Lịch làm việc bác sĩ" của Quản trị viên (doctor F6): `/admin/lich-lam-viec-bac-si`. Mục menu ở
// `features/admin/components/admin-sidebar.tsx` ghi đường dẫn này bằng chữ (không import chéo); test AF-/WA- giữ hai nơi khớp nhau.
export const ADMIN_SCHEDULE_SEGMENT = 'lich-lam-viec-bac-si';
export const ADMIN_SCHEDULE_PATH = `${ROLE_HOME_PATHS.QuanTriVien}/${ADMIN_SCHEDULE_SEGMENT}`;
