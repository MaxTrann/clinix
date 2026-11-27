import {
  compileRules,
  foldVietnamese,
  matchRules,
  splitWords,
  type PhraseRule,
} from './phrase-matcher.js';

// chatbot B1 — bộ máy khớp cụm từ dùng chung cho luật khẩn cấp, ngoài phạm vi, tài khoản (PLAN chatbot 5.8, ATY-02, ATY-04).
// Bảng dữ liệu thật nằm ở emergency.rules.ts, out-of-scope.rules.ts, account.rules.ts (có test riêng); ở đây dùng bảng giả để thử CƠ CHẾ.
const RULES = compileRules([
  { id: 'R_NGUC', phrases: ['đau ngực', 'đau thắt ngực'] },
  { id: 'R_NGAT', phrases: ['ngất', 'bất tỉnh'] },
  { id: 'R_THO', phrases: ['khó thở'] },
] satisfies PhraseRule[]);

const hit = (text: string, masks = compileRules([])) =>
  matchRules(text, RULES, masks)?.ruleId ?? null;

describe('chatbot B1 — phrase-matcher: tách từ và bỏ dấu', () => {
  it('ATY-02: foldVietnamese bỏ dấu, đ thành d, chữ thường', () => {
    expect(foldVietnamese('Đường Nguyễn Văn Linh, Quận 7')).toBe(
      'duong nguyen van linh, quan 7',
    );
    expect(foldVietnamese('ĐAU NGỰC')).toBe('dau nguc');
  });

  it('ATY-02: splitWords tách theo mọi thứ không phải chữ, dấu ghép hay số; chữ thường; NFC', () => {
    expect(splitWords('  Đau-ngực,  KHÓ   thở!! 115 ')).toEqual([
      'đau',
      'ngực',
      'khó',
      'thở',
      '115',
    ]);
    // Dạng tổ hợp (NFD) được ghép lại trước khi tách
    expect(splitWords('ngực'.normalize('NFD'))).toEqual(['ngực']);
    expect(splitWords('')).toEqual([]);
    expect(splitWords('  ,.;  ')).toEqual([]);
  });
});

describe('chatbot B1 — phrase-matcher: khớp theo từng từ', () => {
  it('ATY-01: khớp cụm có dấu, ở đầu, giữa và cuối câu', () => {
    expect(hit('đau ngực')).toBe('R_NGUC');
    expect(hit('tôi bị đau ngực từ sáng')).toBe('R_NGUC');
    expect(hit('từ sáng tôi bị đau ngực')).toBe('R_NGUC');
  });

  it('ATY-02: câu không dấu, VIẾT HOA, nhiều khoảng trắng, dấu câu xen giữa đều khớp', () => {
    expect(hit('dau nguc')).toBe('R_NGUC');
    expect(hit('DAU NGUC')).toBe('R_NGUC');
    expect(hit('ĐAU    NGỰC')).toBe('R_NGUC');
    expect(hit('bi   dau,nguc!')).toBe('R_NGUC');
    expect(hit('kho thở')).toBe('R_THO');
  });

  it('ATY-02: dạng tổ hợp (NFD) của câu và của cụm cùng khớp', () => {
    expect(hit('đau ngực'.normalize('NFD'))).toBe('R_NGUC');
    const nfdRules = compileRules([
      { id: 'R_NFD', phrases: ['đau ngực'.normalize('NFD')] },
    ]);
    expect(matchRules('đau ngực', nfdRules)).toEqual({ ruleId: 'R_NFD' });
  });

  it('ATY-02: câu gõ LẪN (chữ có dấu và không dấu) vẫn khớp từng từ', () => {
    expect(hit('toi bi dau nguc, khó chịu quá')).toBe('R_NGUC');
    expect(hit('tôi bị đau nguc')).toBe('R_NGUC');
    expect(hit('tôi bị dau ngực')).toBe('R_NGUC');
  });

  it('ATY-04: từ có dấu KHÁC dấu của cụm thì không khớp ("ngạt mũi" không phải "ngất")', () => {
    expect(hit('ngạt mũi nhẹ')).toBeNull();
    expect(hit('tôi bị ngất')).toBe('R_NGAT');
    expect(hit('ngát hương')).toBeNull();
  });

  it('B1-ATY: câu gõ toàn không dấu thì "ngat" khớp "ngất" (đã biết, thà bắt thừa; ghi ở TRACKING)', () => {
    expect(hit('ngat mui nhe')).toBe('R_NGAT');
  });

  it('ATY-04: cụm là dãy từ LIỀN nhau, thiếu thứ tự hay xen từ lạ thì không khớp', () => {
    expect(hit('đau ở ngực')).toBeNull(); // cụm "đau ngực" không có "ở"
    expect(hit('ngực đau')).toBeNull();
    expect(hit('đau đầu, ngực khoẻ')).toBeNull();
    expect(hit('đau thắt ngực')).toBe('R_NGUC'); // có dòng riêng
  });

  it('ATY-04: khớp theo TỪ nguyên vẹn, không khớp chuỗi con ("ngực" không nằm trong "ngựcc")', () => {
    expect(hit('đau ngựcc')).toBeNull();
    expect(hit('đauu ngực')).toBeNull();
    expect(hit('xđau ngực')).toBeNull();
  });

  it('ATY-03: phủ định không làm mất khớp', () => {
    expect(hit('tôi không khó thở')).toBe('R_THO');
    expect(hit('chưa bao giờ đau ngực')).toBe('R_NGUC');
  });

  it('B1-ATY: câu rỗng, chỉ dấu câu, hay không có gì để khớp ⇒ null', () => {
    expect(hit('')).toBeNull();
    expect(hit('   ')).toBeNull();
    expect(hit('!!!')).toBeNull();
    expect(hit('xin chào, cho mình hỏi giá khám')).toBeNull();
  });

  it('B1-ATY: nhiều luật cùng khớp thì lấy luật ĐẦU TIÊN theo thứ tự bảng (mã luật ổn định cho log)', () => {
    expect(hit('khó thở và đau ngực')).toBe('R_NGUC');
    expect(hit('bất tỉnh, khó thở')).toBe('R_NGAT');
  });
});

describe('chatbot B1 — phrase-matcher: mặt nạ (cụm ngoại lệ có kiểm chứng)', () => {
  const rules = compileRules([{ id: 'CHAN_DOAN', phrases: ['chẩn đoán'] }]);
  const masks = compileRules([
    { id: 'NGOAI_LE', phrases: ['chẩn đoán hình ảnh'] },
  ]);
  const run = (text: string) => matchRules(text, rules, masks)?.ruleId ?? null;

  it('ATY-06: cụm nằm trong ngoại lệ thì các từ của nó không dùng để khớp', () => {
    expect(run('phòng khám có chẩn đoán hình ảnh không')).toBeNull();
    expect(run('CHAN DOAN HINH ANH')).toBeNull();
  });

  it('ATY-06: ngoại lệ không che nơi khác trong câu', () => {
    expect(run('chẩn đoán hình ảnh rồi bác sĩ chẩn đoán giúp tôi')).toBe(
      'CHAN_DOAN',
    );
    expect(run('chẩn đoán cho tôi')).toBe('CHAN_DOAN');
    expect(run('chẩn đoán hình')).toBe('CHAN_DOAN'); // thiếu "ảnh": không phải ngoại lệ
  });

  it('B1-ATY: không có mặt nạ thì không che gì', () => {
    expect(matchRules('chẩn đoán hình ảnh', rules)?.ruleId).toBe('CHAN_DOAN');
  });
});

describe('chatbot B1 — phrase-matcher: dữ liệu sai bị phát hiện khi biên dịch bảng', () => {
  it('B1-ATY: cụm rỗng hay toàn dấu câu bị từ chối (cụm rỗng sẽ khớp mọi câu)', () => {
    expect(() => compileRules([{ id: 'X', phrases: [''] }])).toThrow(/rỗng/);
    expect(() => compileRules([{ id: 'X', phrases: [' ,; '] }])).toThrow(
      /rỗng/,
    );
  });

  it('B1-ATY: mã nhóm trùng bị từ chối', () => {
    expect(() =>
      compileRules([
        { id: 'X', phrases: ['a b'] },
        { id: 'X', phrases: ['c d'] },
      ]),
    ).toThrow(/trùng/);
  });
});
