import type { PhraseRule } from '../safety/phrase-matcher.js';

// DANH SÁCH của các luật đối chiếu V4, V5, V7, V8 (chatbot B2; PLAN chatbot 5.7). Tách khỏi logic để người duyệt đọc được (như `*.rules.ts` của B1).
// Đại duyệt ngày 27/11/2026: dùng ĐÚNG chữ PLAN 5.7, KHÔNG ngoại lệ nào. Ngoại lệ chỉ thêm khi X1 M6 cho thấy loại nhầm và có kiểm chứng (T2).
// Các cụm khớp theo từng từ như B1 (đúng dấu hoặc bỏ dấu): từ có dấu "liệu" không khớp "liều", nhưng từ gõ không dấu "lieu" thì khớp.

/** V4: chức danh viết đủ. Chỉ tính khi từ viết hoa đứng sau KHOẢNG TRẮNG (không dấu chấm: "gặp bác sĩ. Tôi…" là hết câu). */
export const V4_SPELLED_TITLES: readonly string[] = ['bác sĩ', 'bac si'];

/** V4: chức danh viết tắt, nối nhau bằng dấu chấm hay khoảng trắng ("ThS.BS.", "PGS.TS.BS"). */
export const V4_ABBREVIATED_TITLES: readonly string[] = [
  'BS',
  'ThS',
  'TS',
  'PGS',
  'GS',
];

/** V5: từ nối được phép đứng sau "chuyên khoa" ngoài tên chuyên khoa đang hoạt động (đúng PLAN). */
export const V5_CONNECTORS: readonly string[] = [
  'phù hợp',
  'nào',
  'khác',
  'này',
  'đó',
];

/** V7: khẳng định hệ thống không chứng được. */
export const V7_PHRASES: readonly string[] = [
  'thứ hai',
  'thứ ba',
  'thứ tư',
  'thứ năm',
  'thứ sáu',
  'thứ bảy',
  'chủ nhật',
  'cuối tuần',
  'ngày lễ',
  'miễn phí',
  'giảm giá',
  'khuyến mãi',
  'tốt nhất',
  'giỏi nhất',
];

/** V8: từ chẩn đoán và kê đơn (cụm "uống … viên" có mẫu riêng ở `output-verifier.ts` vì B1 chỉ khớp cụm liền nhau). */
export const V8_PHRASES: readonly string[] = [
  'liều',
  'bạn bị',
  'chẩn đoán là',
  'kê đơn',
];

/** V8: dạng phủ định được phép ("Trợ lý không kê đơn"); các từ của cụm bị che, không dùng để khớp. */
export const V8_NEGATION_MASKS: readonly string[] = [
  'không kê đơn',
  'không chẩn đoán',
];

export const V7_RULES: readonly PhraseRule[] = [
  { id: 'V7', phrases: V7_PHRASES },
];
export const V8_RULES: readonly PhraseRule[] = [
  { id: 'V8', phrases: V8_PHRASES },
];
export const V8_MASK_RULES: readonly PhraseRule[] = [
  { id: 'V8_PHU_DINH', phrases: V8_NEGATION_MASKS },
];
