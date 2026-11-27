// Bề mặt công khai DUY NHẤT của module chat (phần web): `router/` và module khác chỉ import từ đây. Đường dẫn trang Tin nhắn nằm ở
// `shared/routes/chat-paths.ts` để menu và Trung tâm thông báo dùng chung mà không import `features/chat`.
// chat F1: route trang Tin nhắn (ghép vào ba khung ở `router/role-routes.tsx`) và hook thăm dò số hội thoại chưa đọc (router gọi rồi truyền xuống menu).
export { CHAT_ROUTES } from './chat-routes';
export {
  CHAT_UNREAD_POLL_MS,
  useChatUnreadCount,
} from './unread/use-chat-unread-count';
// chat F2: router giữ kết nối WebSocket cho khung Bệnh nhân, Bác sĩ, Lễ tân (một kết nối mỗi tab; khung gỡ khi đăng xuất là đóng)
export { useChatConnection } from './realtime/chat-connection';
