import {
  detectOutOfScope,
  OUT_OF_SCOPE_EXCEPTIONS,
  OUT_OF_SCOPE_RULES,
} from './out-of-scope.rules.js';
import { foldVietnamese } from './phrase-matcher.js';

// chatbot B1 — ATY-05, ATY-06 (PLAN chatbot 7.3): luật NGOÀI PHẠM VI (chẩn đoán, kê đơn; 5.8). Hàm thuần.
const ALL_PHRASES = OUT_OF_SCOPE_RULES.flatMap((rule) =>
  rule.phrases.map((phrase) => ({ ruleId: rule.id, phrase })),
);

describe('chatbot B1 — luật ngoài phạm vi: bảng đã duyệt (pin số lượng)', () => {
  it('B1-ATY: 4 nhóm với mã ổn định, 18 cụm; một ngoại lệ tên dịch vụ', () => {
    expect(OUT_OF_SCOPE_RULES.map((rule) => rule.id)).toEqual([
      'NP_KE_DON',
      'NP_THUOC',
      'NP_CHAN_DOAN',
      'NP_DOC_KET_QUA',
    ]);
    expect(ALL_PHRASES).toHaveLength(18);
    expect(OUT_OF_SCOPE_EXCEPTIONS.flatMap((rule) => rule.phrases)).toEqual([
      'chẩn đoán hình ảnh',
    ]);
  });
});

describe('chatbot B1 — luật ngoài phạm vi: chẩn đoán, kê đơn (ATY-05)', () => {
  it.each(ALL_PHRASES.map((entry) => [entry.phrase, entry.ruleId]))(
    'ATY-05: cụm "%s" ⇒ %s (có dấu, không dấu, viết hoa)',
    (phrase, ruleId) => {
      expect(detectOutOfScope(`bác sĩ cho tôi hỏi ${phrase} nhé`)?.ruleId).toBe(
        ruleId,
      );
      expect(detectOutOfScope(foldVietnamese(phrase!))?.ruleId).toBe(ruleId);
      expect(detectOutOfScope(phrase!.toUpperCase())?.ruleId).toBe(ruleId);
    },
  );

  it.each([
    ['NP_KE_DON', 'bác sĩ kê đơn giúp tôi được không'],
    ['NP_KE_DON', 'kê toa cho em với'],
    ['NP_THUOC', 'tôi nên uống thuốc gì khi bị đau đầu'],
    ['NP_THUOC', 'thuốc nào trị ho tốt nhất'],
    ['NP_THUOC', 'liều dùng paracetamol cho trẻ em'],
    ['NP_THUOC', 'uống bao nhiêu viên mỗi ngày'],
    ['NP_CHAN_DOAN', 'chẩn đoán giúp tôi triệu chứng này'],
    ['NP_CHAN_DOAN', 'tôi bị bệnh gì vậy'],
    ['NP_CHAN_DOAN', 'có phải bị tiểu đường không'],
    ['NP_DOC_KET_QUA', 'đọc kết quả xét nghiệm máu giúp tôi'],
    ['NP_DOC_KET_QUA', 'đọc phim X-quang này giúp em'],
  ])('ATY-05: câu tự nhiên viết tay của nhóm %s', (ruleId, sentence) => {
    expect(detectOutOfScope(sentence)?.ruleId).toBe(ruleId);
    expect(detectOutOfScope(foldVietnamese(sentence))?.ruleId).toBe(ruleId);
  });
});

describe('chatbot B1 — luật ngoài phạm vi: câu hợp lệ không bị từ chối (ATY-06)', () => {
  it('ATY-06: "chẩn đoán hình ảnh" là TÊN DỊCH VỤ nên không bị chặn (có dấu, không dấu, hoa)', () => {
    for (const sentence of [
      'phòng khám có chẩn đoán hình ảnh không',
      'giá chẩn đoán hình ảnh bao nhiêu',
      'chan doan hinh anh o tang may',
      'CHẨN ĐOÁN HÌNH ẢNH',
    ]) {
      expect(detectOutOfScope(sentence)).toBeNull();
    }
  });

  it('ATY-06: ngoại lệ chỉ che đúng cụm dịch vụ, phần còn lại của câu vẫn bị kiểm', () => {
    expect(
      detectOutOfScope('chẩn đoán hình ảnh cho tôi biết tôi bị bệnh gì')
        ?.ruleId,
    ).toBe('NP_CHAN_DOAN');
    expect(
      detectOutOfScope('sau chẩn đoán hình ảnh thì chẩn đoán giúp tôi')?.ruleId,
    ).toBe('NP_CHAN_DOAN');
  });

  it.each([
    'vật lý trị liệu bao nhiêu tiền',
    'vat ly tri lieu bao nhieu tien',
    'tai lieu bao nhieu trang',
    'du lieu bao nhieu',
    'nguyen lieu bao nhieu',
    'tri lieu bao nhieu buoi',
    'mat bao nhieu lieu trinh',
    'liều bao nhiêu',
    'bao nhiêu liều',
    'liệu trình điều trị kéo dài bao lâu',
    'lieu trinh dieu tri keo dai bao lau',
    'đơn vị khám bệnh ở tầng mấy',
    'xét nghiệm máu giá bao nhiêu',
    'khám tổng quát gồm những gì',
    'có phải đặt lịch trước không',
    'phòng khám có bán thuốc không',
    'nhà thuốc ở đâu',
    'giá khám bao nhiêu',
    'tôi muốn đặt lịch khám',
    '',
    '   ',
  ])('ATY-06: "%s" không bị từ chối', (sentence) => {
    expect(detectOutOfScope(sentence)).toBeNull();
  });

  it('B1-ATY: ca nhầm nhẹ đã biết (câu quy trình có "đơn thuốc"), ghi lại để không ai ngạc nhiên', () => {
    expect(detectOutOfScope('đơn thuốc cũ có mang theo không')?.ruleId).toBe(
      'NP_KE_DON',
    );
  });
});
