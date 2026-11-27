import type { RouteObject } from 'react-router';
import { CHAT_SEGMENT } from '../../shared/routes/chat-paths';

// Route con "Tin nhắn" (đường dẫn tương đối với gốc khung; ADR 0002: `lazy`). Cùng đoạn đường cho cả ba khung Bệnh nhân, Lễ tân, Bác sĩ
// (PLAN chat 5.13); cổng vai trò do `RequireAuth` của từng khối ở `router/role-routes.tsx` bọc. Khung Quản trị viên KHÔNG ghép mảng này (WCH-02).
// chat F4: khung Bệnh nhân cần đường dẫn trang tra cứu bác sĩ cho nút "Nhắn bác sĩ" (Q24); chat không import `features/search` nên router truyền vào đây
// (nếp `createAdminApprovalsRoutes`).
export function createChatRoutes({
  doctorSearchPath = null,
}: { doctorSearchPath?: string | null } = {}): RouteObject[] {
  return [
    {
      path: CHAT_SEGMENT,
      lazy: () =>
        import('./pages/chat-page').then(({ ChatPage }) => ({
          Component: () => <ChatPage doctorSearchPath={doctorSearchPath} />,
        })),
    },
  ];
}

/** Khung Lễ tân, Bác sĩ (không có nút "Nhắn bác sĩ"). */
export const CHAT_ROUTES: RouteObject[] = createChatRoutes();
