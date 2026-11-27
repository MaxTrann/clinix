import {
  compileRules,
  matchRules,
  type PhraseRule,
  type RuleHit,
} from './phrase-matcher.js';

// chatbot B1 — luật câu hỏi về TÀI KHOẢN của chính người hỏi (PLAN chatbot 5.8, Q4, 2.4.7 HĐK; ATY-07). Chỉ DỮ LIỆU và một hàm khớp.
// Trợ lý KHÔNG đọc dữ liệu tài khoản: gặp câu này chỉ trả câu dựng sẵn `TaiKhoan` kèm liên kết tới trang (không gọi AI). Thứ tự gọi là của chatbot B3
// (sau luật khẩn cấp và giới hạn IP, trước luật ngoài phạm vi). Câu về lịch của bác sĩ, ví dụ, chính sách chung không bị nhận ("của tôi", "của mình" là bắt buộc).
//
// Trạng thái danh sách: 15 cụm, 3 nhóm; 6 cụm của PLAN 5.8, 9 cụm bổ sung.
// Được Đại duyệt ngày 27/11/2026 (qua phiên kiểm, rồi xác nhận trực tiếp bằng hộp câu hỏi); Trung chưa xem.
export const ACCOUNT_RULES: readonly PhraseRule[] = [
  {
    id: 'TK_LICH',
    phrases: [
      'lịch của tôi', // PLAN 5.8
      'lịch hẹn của tôi', // PLAN 5.8
      'lịch khám của tôi',
      'lịch của mình',
      'lịch hẹn của mình',
      'lịch khám của mình',
    ],
  },
  {
    id: 'TK_VI',
    phrases: [
      'số dư', // PLAN 5.8
      'ví của tôi', // PLAN 5.8
      'giao dịch của tôi', // PLAN 5.8
      'ví của mình',
      'giao dịch của mình',
    ],
  },
  {
    id: 'TK_HO_SO',
    phrases: [
      'hồ sơ khám của tôi', // PLAN 5.8
      'hồ sơ khám của mình',
      'hồ sơ của tôi',
      'hồ sơ bệnh án của tôi',
    ],
  },
];

const COMPILED_ACCOUNT_RULES = compileRules(ACCOUNT_RULES);

/** Câu (đã chuẩn hoá) hỏi dữ liệu tài khoản của chính mình không? Trả mã nhóm hoặc `null`. Hàm thuần. */
export function detectAccountQuestion(text: string): RuleHit | null {
  return matchRules(text, COMPILED_ACCOUNT_RULES);
}
