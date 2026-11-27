import { ACCOUNT_RULES, detectAccountQuestion } from './account.rules.js';
import { foldVietnamese } from './phrase-matcher.js';

// chatbot B1 — ATY-07 (PLAN chatbot 7.3): câu hỏi về dữ liệu tài khoản của chính mình (5.8, Q4). Hàm thuần.
const ALL_PHRASES = ACCOUNT_RULES.flatMap((rule) =>
  rule.phrases.map((phrase) => ({ ruleId: rule.id, phrase })),
);

describe('chatbot B1 — luật tài khoản (ATY-07)', () => {
  it('B1-ATY: 3 nhóm với mã ổn định, 15 cụm', () => {
    expect(ACCOUNT_RULES.map((rule) => rule.id)).toEqual([
      'TK_LICH',
      'TK_VI',
      'TK_HO_SO',
    ]);
    expect(ALL_PHRASES).toHaveLength(15);
  });

  it.each(ALL_PHRASES.map((entry) => [entry.phrase, entry.ruleId]))(
    'ATY-07: cụm "%s" ⇒ %s (có dấu, không dấu, viết hoa)',
    (phrase, ruleId) => {
      expect(detectAccountQuestion(`cho mình xem ${phrase} với`)?.ruleId).toBe(
        ruleId,
      );
      expect(detectAccountQuestion(foldVietnamese(phrase!))?.ruleId).toBe(
        ruleId,
      );
      expect(detectAccountQuestion(phrase!.toUpperCase())?.ruleId).toBe(ruleId);
    },
  );

  it.each([
    ['TK_LICH', 'lịch hẹn của tôi hôm nay có không'],
    ['TK_LICH', 'cho tôi xem lịch của mình tuần này'],
    ['TK_VI', 'ví của tôi còn bao nhiêu tiền'],
    ['TK_VI', 'kiểm tra số dư giúp tôi'],
    ['TK_VI', 'giao dịch của tôi hôm qua'],
    ['TK_HO_SO', 'hồ sơ khám của tôi ở đâu'],
  ])('ATY-07: câu tự nhiên viết tay của nhóm %s', (ruleId, sentence) => {
    expect(detectAccountQuestion(sentence)?.ruleId).toBe(ruleId);
    expect(detectAccountQuestion(foldVietnamese(sentence))?.ruleId).toBe(
      ruleId,
    );
  });

  it.each([
    'lịch của bác sĩ Nam thế nào',
    'lịch khám của phòng khám',
    'ví dụ cho tôi biết giá khám',
    'ví điện tử có nạp tiền không',
    'hồ sơ cần chuẩn bị gì',
    'giao dịch bị lỗi thì sao',
    'số điện thoại của tôi',
    'dư tiền thì hoàn lại thế nào',
    'phòng khám có lịch trống không',
    '',
    '   ',
  ])('ATY-07: "%s" không phải câu hỏi tài khoản', (sentence) => {
    expect(detectAccountQuestion(sentence)).toBeNull();
  });
});
