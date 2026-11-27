import {
  MAX_HISTORY_TURNS,
  MAX_TURN_LENGTH,
  type HistoryTurn,
} from '../api/chatbot-types';
import { doanPlainText } from './doan-text';
import type { Exchange } from './exchange';
import { truncateCodePoints } from './question';

// `lichSu` gửi kèm câu mới (PLAN 5.12, 5.14): tối đa 6 PHẦN TỬ cuối (đúng 3 cặp hỏi và đáp, luôn bắt đầu bằng `NguoiDung`),
// mỗi `noiDung` cắt ở 800 điểm mã (chữ trả lời do máy chủ ghép từ tên thực thể có thể dài hơn và sẽ bị DTO từ chối).
// KHÔNG gồm lượt đang chờ, lượt lỗi, lượt `DuPhong` (Q13: lượt lỗi không vào lịch sử), kể cả khi máy chủ gửi cờ sai.
export function buildHistory(exchanges: readonly Exchange[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const exchange of exchanges) {
    const { outcome } = exchange;
    if (outcome.kind !== 'reply') continue;
    const { reply } = outcome;
    if (!reply.tinhVaoLichSu || reply.ketQua === 'DuPhong') continue;
    const answer = doanPlainText(reply.doan);
    if (answer === '') continue;
    turns.push(
      {
        vai: 'NguoiDung',
        noiDung: truncateCodePoints(exchange.question, MAX_TURN_LENGTH),
      },
      { vai: 'TroLy', noiDung: truncateCodePoints(answer, MAX_TURN_LENGTH) },
    );
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}
