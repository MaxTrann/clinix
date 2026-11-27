import { useSearchParams } from 'react-router';
import { CHAT_QUERY } from '../../../shared/routes/chat-paths';

// Trang Tin nhắn TẠM của ba khung (chat F1, PLAN chat 5.13): route và menu có trước, khung nhắn tin dùng chung (`ChatWorkspace`) là chat F3 rồi F4, F5.
// Đọc sẵn `?hoiThoai=` để liên kết từ Trung tâm thông báo vào đúng trang ngay từ bây giờ; chưa gọi API.
export function ChatPage() {
  const [params] = useSearchParams();
  const hoiThoaiId = params.get(CHAT_QUERY.conversation);
  return (
    <section aria-labelledby="chat-page-title" className="p-6">
      <h1 id="chat-page-title" className="text-xl font-semibold text-gray-900">
        Tin nhắn
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        {hoiThoaiId
          ? 'Khung trò chuyện đang được hoàn thiện. Hội thoại bạn chọn sẽ mở tại đây.'
          : 'Khung trò chuyện đang được hoàn thiện.'}
      </p>
    </section>
  );
}
