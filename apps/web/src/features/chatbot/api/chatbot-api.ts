import { LONG_TIMEOUT_MS, request } from '../../../shared/api/client';
import { parseSpecialties, parseSuggestion } from '../suggest/parse-suggestion';
import type {
  ChatbotReply,
  ChatbotRequest,
  SpecialtyOption,
  SuggestParams,
  Suggestion,
} from './chatbot-types';
import { parseReply } from './parse-reply';

// Danh sách chuyên khoa công khai không phân trang ở khung chat: một trang lớn như trang tra cứu (`SPECIALTY_PAGE_SIZE` của search)
const SPECIALTY_PAGE_SIZE = 100;

// Cổng gọi máy chủ của khung chat: MỘT chỗ để thay lớp thật bằng lớp giả. Bản chạy thật là `httpChatbotApi`; lớp giả chỉ nằm
// ở `testing/` và test truyền vào `ChatbotWidget api={…}`. `architecture.test.ts` khoá việc mã chạy thật import `testing/`.
export interface ChatbotApi {
  // Đúng MỘT lời gọi mỗi lần gửi. Quá giờ, mất mạng, huỷ: ném `TimeoutError`, `NetworkError`, `RequestAbortedError` của lớp client.
  ask(body: ChatbotRequest, signal: AbortSignal): Promise<ChatbotReply>;
  // Gợi ý bác sĩ và khung giờ trống theo chuyên khoa (chatbot B4). Chỉ ĐỌC: chatbot không giữ chỗ, không đặt lịch.
  suggest(params: SuggestParams, signal: AbortSignal): Promise<Suggestion>;
  // Chuyên khoa công khai đang hoạt động, cho nút "Chọn chuyên khoa khác"
  listSpecialties(signal: AbortSignal): Promise<SpecialtyOption[]>;
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

  async suggest(params, signal) {
    // Tham số vắng (`undefined`) bị lớp client bỏ khỏi query, nên "Toàn quốc" và "để máy chủ chọn ngày" không cần xử lý riêng ở đây
    const raw = await request<unknown>('chatbot/suggestions', {
      query: {
        chuyenKhoaId: params.chuyenKhoaId,
        chiNhanhId: params.chiNhanhId,
        ngay: params.ngay,
        ca: params.ca,
      },
      skipAuthToken: true,
      timeoutMs: LONG_TIMEOUT_MS,
      signal,
    });
    return parseSuggestion(raw);
  },

  async listSpecialties(signal) {
    const raw = await request<unknown>('public/specialties', {
      query: { pageSize: SPECIALTY_PAGE_SIZE },
      skipAuthToken: true,
      signal,
    });
    return parseSpecialties(raw);
  },
};
