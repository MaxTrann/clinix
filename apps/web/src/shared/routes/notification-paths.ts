// Trang Thông báo của bốn khung vai trò (notification F1, PLAN 5.10; khớp manifest Figma Make). Đặt ở `shared/` để `router/` (menu, route) và `features/notification`
// (F2: đường dẫn liên kết) dùng chung mà không import chéo `features/`. File này không import gì nên viết thẳng gốc từng khu; ca NP-01 khoá chúng khớp `ROLE_HOME_PATHS`.
// Đoạn đường là nhãn menu "Thông báo" không dấu (nếp `vi-cua-toi`). Route của Admin gắn ở notification F3 (cùng lúc với chuông ở `AdminHeader`).
export const NOTIFICATIONS_SEGMENT = 'thong-bao';

export const PATIENT_NOTIFICATIONS_PATH = `/benh-nhan/${NOTIFICATIONS_SEGMENT}`;
export const RECEPTION_NOTIFICATIONS_PATH = `/le-tan/${NOTIFICATIONS_SEGMENT}`;
export const DOCTOR_NOTIFICATIONS_PATH = `/bac-si-portal/${NOTIFICATIONS_SEGMENT}`;
export const ADMIN_NOTIFICATIONS_PATH = `/admin/${NOTIFICATIONS_SEGMENT}`;
