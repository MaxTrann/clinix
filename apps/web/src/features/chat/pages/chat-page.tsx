import { useAuth } from '../../auth';
import { CHAT_ROLES } from '../api/chat-types';
import { ChatWorkspace } from '../workspace/chat-workspace';

// Trang Tin nhắn của ba khung (chat F1 tạo route, chat F3 thay trang tạm bằng `ChatWorkspace`; PLAN chat 5.13). Cổng vai trò do `RequireAuth` của từng khối
// ở `router/role-routes.tsx` lo; ở đây chỉ chọn cấu hình theo vai trò đang đăng nhập. F4 (Bệnh nhân bắt đầu trò chuyện) và F5 (hộp thư) mở rộng tiếp.
export function ChatPage({
  doctorSearchPath = null,
}: {
  doctorSearchPath?: string | null;
}) {
  const { user } = useAuth();
  const role = CHAT_ROLES.find((item) => item === user?.vaiTro);
  // Không xảy ra qua router (Quản trị viên không có route này); phòng hờ thì không gọi API chat nào
  if (!role) return null;
  return <ChatWorkspace role={role} doctorSearchPath={doctorSearchPath} />;
}
