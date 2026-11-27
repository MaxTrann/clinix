import { createContext, useContext } from 'react';
import { httpChatbotApi, type ChatbotApi } from '../api/chatbot-api';

// Cổng API cho thẻ gợi ý: `ReplyView` nằm sâu trong danh sách tin nên không nhận `api` qua prop. `ChatbotWidget` đặt `Provider` quanh khung;
// không có `Provider` (dùng thẻ riêng lẻ) thì là bản thật. Test truyền lớp giả qua `ChatbotWidget api={…}` như F1.
export const ChatbotApiContext = createContext<ChatbotApi>(httpChatbotApi);

export function useChatbotApi(): ChatbotApi {
  return useContext(ChatbotApiContext);
}
