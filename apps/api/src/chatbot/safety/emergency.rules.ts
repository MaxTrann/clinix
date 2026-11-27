import {
  compileRules,
  matchRules,
  type PhraseRule,
  type RuleHit,
} from './phrase-matcher.js';

// chatbot B1 — luật KHẨN CẤP tất định (PLAN chatbot 5.8, Q6, T1; ATY-01 đến ATY-04). File này CHỈ chứa DỮ LIỆU (bảng cụm từ) và một hàm khớp:
// danh sách do nhóm duyệt, sửa ở đây, không rải trong logic. Cụm là dãy từ LIỀN nhau (mỗi biến thể một dòng); xem cách khớp ở phrase-matcher.ts.
//
// Hợp đồng:
//  - Chạy trên CÂU ĐANG GỬI (đã chuẩn hoá; MH7 không xét lượt trước), TRƯỚC mọi thứ gọi AI và MIỄN giới hạn tốc độ (5.4 bước 3):
//    thứ tự gọi là của chatbot B3; hàm này không biết bộ giới hạn (khoá bằng safety.architecture.spec.ts).
//  - Bỏ qua phủ định ("tôi không khó thở" vẫn nhận): thà bắt thừa (ATY-03). Câu thường ("ngạt mũi nhẹ", hỏi giá, giờ) không nhận (ATY-04).
//  - Trả MÃ NHÓM ổn định (để log và để chatbot B3 hay nhóm đổi câu trả lời theo nhóm sau này, ví dụ KC_TU_HAI), không trả chữ của câu hỏi.
//
// Trạng thái danh sách: 70 cụm, 15 nhóm. 30 cụm của PLAN 5.8; 36 cụm bổ sung do phiên viết B1 đề xuất; 4 cụm "bổ sung do Đại chốt 27/11/2026".
// Danh sách được Đại duyệt ngày 27/11/2026 (qua phiên kiểm, rồi xác nhận trực tiếp bằng hộp câu hỏi); Trung chưa xem.
// Ca nhập nhằng đã biết ghi ở docs/features/chatbot/TRACKING.md.
export const EMERGENCY_RULES: readonly PhraseRule[] = [
  {
    id: 'KC_DAU_NGUC',
    phrases: [
      'đau ngực', // PLAN 5.8
      'đau thắt ngực',
      'đau tức ngực',
      'tức ngực',
      'nhói ngực',
      'đau vùng ngực',
      'đau ở ngực',
    ],
  },
  {
    id: 'KC_KHO_THO',
    phrases: [
      'khó thở', // PLAN 5.8
      'không thở được', // PLAN 5.8
      'thở không được',
      'thở không nổi',
      'ngạt thở',
      'nghẹt thở',
      'ngừng thở', // bổ sung do Đại chốt 27/11/2026
      'ngưng thở', // bổ sung do Đại chốt 27/11/2026
    ],
  },
  {
    id: 'KC_BAT_TINH',
    phrases: [
      'ngất', // PLAN 5.8
      'bất tỉnh', // PLAN 5.8
      'hôn mê', // PLAN 5.8
      'ngất xỉu',
      'mất ý thức', // bổ sung do Đại chốt 27/11/2026
    ],
  },
  {
    id: 'KC_CO_GIAT',
    phrases: ['co giật', 'lên cơn giật'], // "co giật" là của PLAN 5.8
  },
  {
    id: 'KC_CHAY_MAU',
    phrases: [
      'chảy máu không cầm', // PLAN 5.8
      'chảy nhiều máu', // PLAN 5.8
      'chảy máu nhiều',
      'chảy máu không ngừng',
      'máu chảy không ngừng',
      'ho ra máu',
      'nôn ra máu',
      'xuất huyết', // bổ sung do Đại chốt 27/11/2026 (bắt cả câu hỏi về chu kỳ kinh: thà bắt thừa)
    ],
  },
  {
    id: 'KC_DOT_QUY',
    phrases: [
      'đột quỵ', // PLAN 5.8
      'tai biến', // PLAN 5.8
      'méo miệng', // PLAN 5.8
      'liệt nửa người', // PLAN 5.8
      'yếu nửa người', // PLAN 5.8
      'tê nửa người',
      'méo mồm',
    ],
  },
  {
    id: 'KC_NGO_DOC',
    phrases: ['ngộ độc', 'quá liều', 'uống nhầm thuốc'], // hai cụm đầu của PLAN 5.8
  },
  {
    id: 'KC_TU_HAI',
    phrases: [
      'tự tử', // PLAN 5.8
      'muốn chết', // PLAN 5.8
      'tự làm hại mình', // PLAN 5.8
      'tự sát',
      'không muốn sống',
      'tự làm hại bản thân',
      'tự làm đau mình',
    ],
  },
  {
    id: 'KC_TAI_NAN',
    phrases: [
      'tai nạn', // PLAN 5.8
      'chấn thương đầu', // PLAN 5.8
      'gãy xương hở', // PLAN 5.8
      'chấn thương sọ não',
    ],
  },
  {
    id: 'KC_BONG',
    // "hóa" và "hoá" là hai cách đặt dấu thanh; khớp theo từ không đổi vị trí dấu
    phrases: ['bỏng nặng', 'bỏng hóa chất', 'bỏng hoá chất', 'bỏng độ 3'],
  },
  {
    id: 'KC_DIEN_GIAT',
    phrases: ['điện giật', 'giật điện'],
  },
  {
    id: 'KC_DUOI_NUOC',
    phrases: ['đuối nước', 'chết đuối'],
  },
  {
    id: 'KC_HOC',
    phrases: ['hóc dị vật', 'hóc xương', 'nuốt dị vật', 'nuốt phải dị vật'],
  },
  {
    id: 'KC_PHAN_VE',
    // PLAN viết "sưng môi sưng lưỡi": tách thành hai cụm riêng (rộng hơn)
    phrases: ['sốc phản vệ', 'phản vệ', 'sưng môi', 'sưng lưỡi'],
  },
  {
    id: 'KC_DAU_DAU',
    // PLAN: "đau đầu dữ dội đột ngột"; rút gọn để không bỏ sót câu thiếu "đột ngột"
    phrases: ['đau đầu dữ dội', 'đau đầu đột ngột', 'đột ngột đau đầu'],
  },
];

const COMPILED_EMERGENCY_RULES = compileRules(EMERGENCY_RULES);

/** Câu (đã chuẩn hoá) có dấu hiệu khẩn cấp không? Trả mã nhóm đầu tiên khớp (theo thứ tự bảng) hoặc `null`. Hàm thuần. */
export function detectEmergency(text: string): RuleHit | null {
  return matchRules(text, COMPILED_EMERGENCY_RULES);
}
