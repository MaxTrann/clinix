import type { RouteObject } from 'react-router';
import { CHAT_SEGMENT } from '../../shared/routes/chat-paths';

// Route con "Tin nhắn" (đường dẫn tương đối với gốc khung; ADR 0002: `lazy`). Một mảng cho cả ba khung Bệnh nhân, Lễ tân, Bác sĩ vì đoạn đường giống nhau
// (PLAN chat 5.13); cổng vai trò do `RequireAuth` của từng khối ở `router/role-routes.tsx` bọc. Khung Quản trị viên KHÔNG ghép mảng này (WCH-02).
export const CHAT_ROUTES: RouteObject[] = [
  {
    path: CHAT_SEGMENT,
    lazy: () =>
      import('./pages/chat-page').then((module) => ({
        Component: module.ChatPage,
      })),
  },
];
