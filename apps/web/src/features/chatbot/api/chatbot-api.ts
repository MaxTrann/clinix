import { LONG_TIMEOUT_MS, request } from '../../../shared/api/client';
import type { ChatbotReply, ChatbotRequest } from './chatbot-types';
import { parseReply } from './parse-reply';

// Cổng gọi máy chủ của khung chat: MỘT chỗ để thay lớp thật bằng lớp giả. Bản chạy thật là `httpChatbotApi`; lớp giả chỉ nằm
// ở `testing/` và test truyền vào `ChatbotWidget api={…}`. `architecture.test.ts` khoá việc mã chạy thật import `testing/`.
export interface ChatbotApi {
  // Đúng MỘT lời gọi mỗi lần gửi. Quá giờ, mất mạng, huỷ: ném `TimeoutError`, `NetworkError`, `RequestAbortedError` của lớp client.
  ask(body: ChatbotRequest, signal: AbortSignal): Promise<ChatbotReply>;
  // Đường dây nóng của phòng khám (chỉ gọi khi cần, không lưu lại); `null` = chưa có hoặc không đọc được
  clinicHotline(signal: AbortSignal): Promise<string | null>;
}

export const httpChatbotApi: ChatbotApi = {
  async ask(body, signal) {
    // `skipAuthToken`: API hỏi đáp là công khai, không biết người gọi là ai (PLAN 5.3). `LONG_TIMEOUT_MS`: trần chuỗi AI phía máy chủ là 20 giây.
    const raw = await request<unknown>('chatbot/messages', {
      method: 'POST',
      json: body,
      skipAuthToken: true,
      timeoutMs: LONG_TIMEOUT_MS,
      signal,
    });
    return parseReply(raw);
  },

  async clinicHotline(signal) {
    // API công khai sẵn có; chỉ lấy `duongDayNong` (danh sách trắng ở máy chủ)
    const info = await request<unknown>('public/clinic-info', {
      skipAuthToken: true,
      signal,
    });
    if (typeof info !== 'object' || info === null) return null;
    const { duongDayNong } = info as Record<string, unknown>;
    if (typeof duongDayNong !== 'string') return null;
    const hotline = duongDayNong.trim();
    return hotline === '' ? null : hotline;
  },
};
