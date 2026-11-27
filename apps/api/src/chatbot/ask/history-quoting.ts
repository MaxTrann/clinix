import type { AiTurn } from '../providers/ai-provider.js';
import type { HistoryTurn } from '../safety/question-normalizer.js';
import { QUOTE_PREFIX_ASSISTANT, QUOTE_PREFIX_USER } from './ask.constants.js';

// Đóng gói lịch sử gửi nhà cung cấp thành DỮ LIỆU TRÍCH DẪN (chatbot B3; PLAN chatbot 5.8(2), CPI-02; D2, Đại duyệt 27/11/2026).
// Lượt "Trợ lý" do máy khách gửi lên giả được. Hai adapter của P1 chuyển nguyên vai (`assistant` thành `model_output` ở Gemini), nên nếu giữ vai thì lượt giả sẽ
// thành lời của mô hình. Vì vậy MỌI lượt đi với vai `user`, kèm tiền tố nói rõ nguồn; lời nhắc hệ thống nói các dòng bắt đầu bằng "[Trích dẫn:" là dữ liệu.
// Hàm thuần. Đầu vào là lịch sử ĐÃ CHE định danh; trả BẢN MỚI.

export function quoteHistory(turns: readonly HistoryTurn[]): AiTurn[] {
  return turns.map((turn) => ({
    role: 'user',
    content:
      (turn.vai === 'TroLy' ? QUOTE_PREFIX_ASSISTANT : QUOTE_PREFIX_USER) +
      turn.noiDung,
  }));
}

/** Lượt NGƯỜI DÙNG ngay trước câu đang gửi (không phải lượt Trợ lý): `previousUserTurn` của bộ dựng ngữ cảnh. */
export function lastUserTurn(
  turns: readonly HistoryTurn[],
): string | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.vai === 'NguoiDung') return turn.noiDung;
  }
  return undefined;
}
