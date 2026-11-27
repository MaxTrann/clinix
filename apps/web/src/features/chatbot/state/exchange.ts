import type { ChatbotReply } from '../api/chatbot-types';

// Một lượt hỏi đáp. Chỉ có MỘT lượt `pending` tại một thời điểm.
export type Outcome =
  | { kind: 'pending' }
  | { kind: 'reply'; reply: ChatbotReply }
  // Lỗi không tới được câu trả lời (chữ theo PLAN 5.16). `canRetry` false khi gửi lại y nguyên cũng sai (400).
  | { kind: 'error'; text: string; canRetry: boolean };

export interface Exchange {
  id: number;
  // Đúng chữ đã gửi (đã cắt trắng)
  question: string;
  outcome: Outcome;
}

// Lượt này có thể "Gửi lại" không: lỗi cho phép thử lại, hoặc phản hồi `DuPhong` mà máy chủ cho gửi lại (Q13)
export function canRetryOutcome(outcome: Outcome): boolean {
  if (outcome.kind === 'error') return outcome.canRetry;
  return outcome.kind === 'reply' && outcome.reply.coTheGuiLai;
}
