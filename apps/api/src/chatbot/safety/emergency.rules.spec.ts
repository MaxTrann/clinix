import { detectEmergency, EMERGENCY_RULES } from './emergency.rules.js';
import { foldVietnamese } from './phrase-matcher.js';

// chatbot B1 — ATY-01, ATY-02, ATY-03, ATY-04, ATY-06 (PLAN chatbot 7.3) cho luật KHẨN CẤP (5.8). Hàm thuần.
// Hai lớp kiểm: (1) chạy theo CHÍNH bảng dữ liệu (thêm cụm vào bảng thì tự có ca) và (2) câu viết tay độc lập cho từng nhóm,
// để một lỗi gõ trong bảng không được test lặp lại y nguyên.
const ALL_PHRASES = EMERGENCY_RULES.flatMap((rule) =>
  rule.phrases.map((phrase) => ({ ruleId: rule.id, phrase })),
);

describe('chatbot B1 — bảng khẩn cấp đã duyệt (pin số lượng)', () => {
  it('B1-ATY: 15 nhóm với mã ổn định, 70 cụm (30 PLAN + 36 bổ sung + 4 do Đại chốt 27/11/2026)', () => {
    expect(EMERGENCY_RULES.map((rule) => rule.id)).toEqual([
      'KC_DAU_NGUC',
      'KC_KHO_THO',
      'KC_BAT_TINH',
      'KC_CO_GIAT',
      'KC_CHAY_MAU',
      'KC_DOT_QUY',
      'KC_NGO_DOC',
      'KC_TU_HAI',
      'KC_TAI_NAN',
      'KC_BONG',
      'KC_DIEN_GIAT',
      'KC_DUOI_NUOC',
      'KC_HOC',
      'KC_PHAN_VE',
      'KC_DAU_DAU',
    ]);
    expect(ALL_PHRASES).toHaveLength(70);
    // Không cụm nào lặp ở hai nhóm (lặp làm mã nhóm trong log không còn ổn định)
    expect(new Set(ALL_PHRASES.map((entry) => entry.phrase)).size).toBe(70);
  });

  it('B1-ATY: kết quả chỉ mang mã nhóm, không mang chữ của câu hỏi (an toàn cho log)', () => {
    const hit = detectEmergency('tôi bị đau ngực');
    expect(hit).toEqual({ ruleId: 'KC_DAU_NGUC' });
    expect(Object.keys(hit ?? {})).toEqual(['ruleId']);
  });
});

describe('chatbot B1 — luật khẩn cấp: nhận (ATY-01, ATY-02)', () => {
  it.each(ALL_PHRASES.map((entry) => [entry.phrase, entry.ruleId]))(
    'ATY-01: cụm "%s" trong một câu ⇒ %s',
    (phrase, ruleId) => {
      expect(detectEmergency(`tôi bị ${phrase} từ sáng nay`)?.ruleId).toBe(
        ruleId,
      );
      expect(detectEmergency(phrase!)?.ruleId).toBe(ruleId);
    },
  );

  it.each(ALL_PHRASES.map((entry) => [entry.phrase, entry.ruleId]))(
    'ATY-02: cụm "%s" gõ không dấu, VIẾT HOA, nhiều khoảng trắng và dấu câu ⇒ %s',
    (phrase, ruleId) => {
      const plain = foldVietnamese(phrase!);
      expect(detectEmergency(plain)?.ruleId).toBe(ruleId);
      expect(detectEmergency(`bi ${plain} qua`)?.ruleId).toBe(ruleId);
      expect(detectEmergency(plain.toUpperCase())?.ruleId).toBe(ruleId);
      expect(detectEmergency(phrase!.toUpperCase())?.ruleId).toBe(ruleId);
      expect(
        detectEmergency(`  ${plain.split(' ').join('   ')} ,, !! `)?.ruleId,
      ).toBe(ruleId);
      expect(detectEmergency(phrase!.normalize('NFD'))?.ruleId).toBe(ruleId);
    },
  );

  it.each([
    ['KC_DAU_NGUC', 'Mẹ tôi đang đau ngực dữ lắm, làm sao bây giờ'],
    ['KC_KHO_THO', 'bé nhà em khó thở từ chiều tới giờ'],
    ['KC_BAT_TINH', 'ông tôi vừa ngất, gọi không tỉnh'],
    ['KC_CO_GIAT', 'cháu bị co giật khi sốt cao'],
    ['KC_CHAY_MAU', 'vết cắt chảy nhiều máu quá'],
    ['KC_DOT_QUY', 'bà bị méo miệng và nói ngọng'],
    ['KC_NGO_DOC', 'em bé uống nhầm thuốc của người lớn'],
    ['KC_TU_HAI', 'tôi muốn tự tử'],
    ['KC_TAI_NAN', 'anh tôi vừa bị tai nạn xe máy'],
    ['KC_BONG', 'em bị bỏng hóa chất ở tay'],
    ['KC_DIEN_GIAT', 'cháu bị điện giật ở ổ cắm'],
    ['KC_DUOI_NUOC', 'bé bị đuối nước ở hồ bơi'],
    ['KC_HOC', 'bé hóc dị vật và không nói được'],
    ['KC_PHAN_VE', 'sau khi tiêm thì bị sốc phản vệ'],
    ['KC_DAU_DAU', 'tự nhiên đau đầu dữ dội luôn'],
  ])('ATY-01: câu tự nhiên viết tay của nhóm %s', (ruleId, sentence) => {
    expect(detectEmergency(sentence)?.ruleId).toBe(ruleId);
    // cùng câu bỏ dấu
    expect(detectEmergency(foldVietnamese(sentence))?.ruleId).toBe(ruleId);
  });

  it('ATY-01/ATY-02: bốn cụm bổ sung do Đại chốt 27/11/2026 (có dấu và không dấu)', () => {
    expect(detectEmergency('bé đột ngột ngừng thở')?.ruleId).toBe('KC_KHO_THO');
    expect(detectEmergency('bà tôi ngưng thở rồi')?.ruleId).toBe('KC_KHO_THO');
    expect(detectEmergency('anh ấy mất ý thức')?.ruleId).toBe('KC_BAT_TINH');
    expect(detectEmergency('bị xuất huyết tiêu hóa')?.ruleId).toBe(
      'KC_CHAY_MAU',
    );
    expect(detectEmergency('be ngung tho')?.ruleId).toBe('KC_KHO_THO');
    expect(detectEmergency('ba ngung tho roi')?.ruleId).toBe('KC_KHO_THO');
    expect(detectEmergency('anh ay mat y thuc')?.ruleId).toBe('KC_BAT_TINH');
    expect(detectEmergency('bi xuat huyet')?.ruleId).toBe('KC_CHAY_MAU');
    // ca nhập nhằng đã biết: chu kỳ kinh nguyệt cũng bị bắt (thà bắt thừa; ghi ở TRACKING)
    expect(detectEmergency('xuất huyết khi tới kỳ kinh')?.ruleId).toBe(
      'KC_CHAY_MAU',
    );
  });

  it('ATY-02: câu gõ lẫn có dấu và không dấu vẫn nhận (nhờ khớp theo từng từ)', () => {
    expect(detectEmergency('toi bi dau nguc, khó chịu quá')?.ruleId).toBe(
      'KC_DAU_NGUC',
    );
    expect(detectEmergency('Tôi bị Đau nguc')?.ruleId).toBe('KC_DAU_NGUC');
  });

  it('ATY-01: nhiều nhóm cùng khớp thì lấy nhóm đầu bảng (mã nhóm xác định)', () => {
    expect(detectEmergency('đau ngực và khó thở')?.ruleId).toBe('KC_DAU_NGUC');
    expect(detectEmergency('khó thở rồi bất tỉnh')?.ruleId).toBe('KC_KHO_THO');
  });
});

describe('chatbot B1 — luật khẩn cấp: phủ định vẫn nhận (ATY-03)', () => {
  it.each([
    'tôi không khó thở',
    'chưa bao giờ đau ngực',
    'không bị ngất',
    'bé không co giật',
    'khong kho tho',
    'em chẳng muốn chết đâu, chỉ hỏi giá thôi',
  ])('ATY-03: "%s" vẫn nhận (hành vi đã chốt: thà bắt thừa)', (sentence) => {
    expect(detectEmergency(sentence)).not.toBeNull();
  });
});

describe('chatbot B1 — luật khẩn cấp: câu thường không nhận (ATY-04, ATY-06)', () => {
  it.each([
    'giá khám tổng quát bao nhiêu',
    'phòng khám mở cửa mấy giờ',
    'tôi muốn đặt lịch khám nội ngày mai',
    'hôm nay còn lịch khám không',
    'phòng khám có khám ngạt mũi không',
    'ngạt mũi nhẹ',
    'cho em hỏi một xíu',
    'cho em hoi mot xiu',
    'vật lý trị liệu bao nhiêu tiền',
    'vat ly tri lieu bao nhieu tien',
    'đau đầu nhẹ',
    'đau lưng và đau bụng nhẹ',
    'đau ngón tay',
    'khó ngủ về đêm',
    'ho khan và sốt nhẹ',
    'khám tai mũi họng giá bao nhiêu',
    'ví dụ như khám tổng quát',
    'chẩn đoán hình ảnh ở tầng mấy',
    'chuyên khoa tim mạch khám những gì',
    'bảo hiểm y tế có áp dụng không',
    'triệu chứng xuất hiện từ hôm qua',
    'trieu chung xuat hien tu hom qua',
    'xét nghiệm máu cần nhịn ăn không',
    'tôi muốn hiến máu',
    'thở sâu có tốt không',
    'ngực',
    'chết',
    'mất ý kiến',
    'đau ở lưng',
    '',
    '   ',
    '!!!',
  ])('ATY-04: "%s" không phải khẩn cấp', (sentence) => {
    expect(detectEmergency(sentence)).toBeNull();
  });

  it('ATY-06: câu gần giống cụm khẩn cấp nhưng hợp lệ (khác dấu, thiếu từ, chen từ lạ, dính chữ) không nhận', () => {
    expect(detectEmergency('ngạt mũi')).toBeNull(); // "ngạt" khác "ngất" khi có dấu
    expect(detectEmergency('nghẹt mũi')).toBeNull();
    expect(detectEmergency('đau đầu, ngực khoẻ')).toBeNull();
    expect(detectEmergency('đau ngựcc')).toBeNull();
    expect(detectEmergency('khó khăn khi thở')).toBeNull();
    expect(detectEmergency('tai mũi họng')).toBeNull();
  });

  it('B1-ATY: ca nhập nhằng đã biết, ghi lại để không ai ngạc nhiên (thà bắt thừa)', () => {
    // "ngat mui" không dấu: "ngat" là dạng bỏ dấu của "ngất" nên bị nhận (đã bàn: giữ, ghi ở TRACKING)
    expect(detectEmergency('ngat mui nhe')?.ruleId).toBe('KC_BAT_TINH');
    expect(
      detectEmergency('bảo hiểm tai nạn có được hưởng không')?.ruleId,
    ).toBe('KC_TAI_NAN');
    expect(detectEmergency('đau muốn chết')?.ruleId).toBe('KC_TU_HAI');
    // "tu tu" không dấu thường là "từ từ", nhưng cũng là "tự tử" bỏ dấu: bị nhận (thà bắt thừa; câu có dấu "từ từ" thì không)
    expect(detectEmergency('cho minh tu tu xem')?.ruleId).toBe('KC_TU_HAI');
    expect(detectEmergency('cho mình từ từ xem')).toBeNull();
    expect(detectEmergency('ngộ độc thực phẩm có khám không')?.ruleId).toBe(
      'KC_NGO_DOC',
    );
  });
});
