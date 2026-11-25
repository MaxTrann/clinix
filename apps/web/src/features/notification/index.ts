// Bề mặt công khai DUY NHẤT của module notification (phần web): `router/` và module khác chỉ import từ đây (WTB-16). Đường dẫn trang Thông báo nằm ở
// `shared/routes/notification-paths.ts` để menu và module khác dùng chung.
// F1: route trang Thông báo (ghép vào ba khung ở `router/role-routes.tsx`) và hook thăm dò số chưa đọc (router gọi rồi truyền xuống khung qua prop).
export { NOTIFICATION_ROUTES } from './notification-routes';
export { useUnreadCount, UNREAD_POLL_MS } from './unread/use-unread-count';
export type { UnreadSnapshot } from './unread/unread-store';
