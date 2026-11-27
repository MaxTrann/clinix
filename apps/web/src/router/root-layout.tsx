import { Outlet } from 'react-router';
import { ChatbotWidget } from '../features/chatbot';
import { OfflineBanner } from '../shared/ui/offline-banner';

export function RootLayout() {
  return (
    <>
      <OfflineBanner />
      <Outlet />
      {/* Khung chat Trợ lý AI (chatbot F1): gắn một lần ở đây nên giữ được lịch sử khi đổi trang; tự ẩn theo vai và trang */}
      <ChatbotWidget />
    </>
  );
}
