import {
  compileRules,
  matchRules,
  type PhraseRule,
  type RuleHit,
} from './phrase-matcher.js';

// chatbot B1 — luật NGOÀI PHẠM VI tất định: chẩn đoán, kê đơn (PLAN chatbot 5.8, SOW 3.2.6; ATY-05, ATY-06). Chỉ DỮ LIỆU và một hàm khớp.
// Danh sách cố ý HẸP: chỉ chặn bằng luật khi chắc chắn; phần còn lại do mô hình gắn `ngoaiPhamVi` và lời nhắc hệ thống lo (5.8), nên câu không
// chứa từ khoá vẫn có thể bị từ chối ở bước sau. Chạy sau luật khẩn cấp và luật tài khoản (thứ tự của chatbot B3).
//
// PLAN ghi "liều" đứng một mình: thay bằng cụm "liều dùng", "liều lượng", vì "liều" bỏ dấu thành "lieu" trùng "liệu" (liệu trình, trị liệu, tài liệu, dữ liệu).
// Hai cụm "liều bao nhiêu" và "bao nhiêu liều" cũng KHÔNG đưa vào: ca ATY-06 phát hiện "vat ly tri lieu bao nhieu tien" (hỏi giá trị liệu, gõ không dấu) bị nhận nhầm.
// Trạng thái danh sách: 18 cụm, 4 nhóm; 12 cụm của PLAN 5.8, 6 cụm bổ sung hay thay "liều" trần.
// Bản 20 cụm được Đại duyệt ngày 27/11/2026 (qua phiên kiểm); việc BỎ hai cụm "liều bao nhiêu", "bao nhiêu liều" do ca ATY-06 phát hiện
// được Đại xác nhận trực tiếp bằng hộp câu hỏi cùng ngày. Trung chưa xem.
export const OUT_OF_SCOPE_RULES: readonly PhraseRule[] = [
  {
    id: 'NP_KE_DON',
    phrases: ['kê đơn', 'kê toa', 'kê thuốc', 'đơn thuốc'], // "kê thuốc" là bổ sung
  },
  {
    id: 'NP_THUOC',
    phrases: [
      'uống thuốc gì', // PLAN 5.8
      'thuốc nào', // PLAN 5.8
      'bao nhiêu viên', // PLAN 5.8
      'dùng thuốc gì',
      'uống thuốc nào',
      'liều dùng', // thay cho "liều" trần
      'liều lượng',
    ],
  },
  {
    id: 'NP_CHAN_DOAN',
    phrases: [
      'chẩn đoán', // PLAN 5.8 (trừ tên dịch vụ, xem OUT_OF_SCOPE_EXCEPTIONS)
      'bị bệnh gì', // PLAN 5.8
      'mắc bệnh gì', // PLAN 5.8
      'có phải bị', // PLAN 5.8
      'là bệnh gì',
    ],
  },
  {
    id: 'NP_DOC_KET_QUA',
    phrases: ['đọc kết quả xét nghiệm', 'đọc phim'],
  },
];

/**
 * Cụm là TÊN DỊCH VỤ chứ không phải yêu cầu chẩn đoán: các từ của nó bị che trước khi khớp. Ví dụ "phòng khám có chẩn đoán hình ảnh không" được qua,
 * còn "chẩn đoán hình ảnh cho tôi biết tôi bị bệnh gì" vẫn bị chặn nhờ "bị bệnh gì". Mỗi ngoại lệ phải có lý do kiểm chứng được (PLAN 5.7, T2).
 */
export const OUT_OF_SCOPE_EXCEPTIONS: readonly PhraseRule[] = [
  { id: 'NGOAI_LE_DICH_VU', phrases: ['chẩn đoán hình ảnh'] },
];

const COMPILED_RULES = compileRules(OUT_OF_SCOPE_RULES);
const COMPILED_EXCEPTIONS = compileRules(OUT_OF_SCOPE_EXCEPTIONS);

/** Câu (đã chuẩn hoá) đòi chẩn đoán hay kê đơn không? Trả mã nhóm hoặc `null`. Hàm thuần. */
export function detectOutOfScope(text: string): RuleHit | null {
  return matchRules(text, COMPILED_RULES, COMPILED_EXCEPTIONS);
}
