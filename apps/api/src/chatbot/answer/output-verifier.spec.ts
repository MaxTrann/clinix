import { createContextIndex } from '../context/context-index.js';
import type { PlaceholderRef } from '../context/placeholder.js';
import { verifyAnswer, type VerifierContext } from './output-verifier.js';

// chatbot B2 — luật đối chiếu V2 đến V9 (PLAN chatbot 5.7). Mã test: DCR-02 đến DCR-09, DCR-12 và ca cơ chế B2-nn. Hàm thuần: không DB, không mạng.

const refs: PlaceholderRef[] = [
  { kind: 'CK', id: '3' },
  { kind: 'BS', id: '12' },
  { kind: 'GIA', id: '12' },
  { kind: 'CN', id: '1' },
  { kind: 'DC', id: '1' },
  { kind: 'GIO', id: '1' },
  { kind: 'DV', id: '5' },
  { kind: 'GIADV', id: '5' },
  { kind: 'COC', id: '5' },
  { kind: 'TL', id: '5' },
  { kind: 'HOAN', id: '5' },
  { kind: 'PK', id: 'hotline' },
  { kind: 'PK', id: 'email' },
  { kind: 'CS', id: 'giuCho' },
  { kind: 'CS', id: 'doiLich' },
];
// Chuyên khoa "4" đang hoạt động nhưng KHÔNG có chỗ giữ trong ngữ cảnh (ví dụ bị cắt): dùng [[CK:4]] là V2
const SPECIALTIES = new Map([
  ['3', 'Tim mạch'],
  ['4', 'Nhi khoa'],
]);

// Mã chim mồi thật có thể chứa chữ số (khi đó V3 bắt trước V9, kết quả vẫn là câu A2); ở đây dùng chữ để ca V9 tách riêng khỏi V3
const CANARY = 'CANARYXKQZPLMNBV';
const PROMPT =
  'Bạn là Trợ lý AI của phòng khám CLINIX. Chỉ trả lời dựa trên dữ liệu công khai được cung cấp và luôn nhắc người dùng đến gặp bác sĩ khi cần.';
const guard: VerifierContext = {
  index: createContextIndex(refs, SPECIALTIES),
  canary: CANARY,
  protectedPrompt: PROMPT,
};

const ruleOf = (traLoi: string): string => {
  const result = verifyAnswer(traLoi, guard);
  return result.ok ? 'OK' : result.ruleId;
};

describe('chatbot B2 — verifyAnswer: câu hợp lệ', () => {
  it('DCR-01: câu dùng đủ loại chỗ giữ hợp lệ qua', () => {
    const text =
      'Chuyên khoa [[CK:3]] có [[BS:12]] khám tại [[CN:1]], giá khám [[GIA:12]]. ' +
      'Địa chỉ [[DC:1]], giờ nhận khám [[GIO:1]]. Dịch vụ [[DV:5]] giá [[GIADV:5]], cọc [[COC:5]], thời lượng [[TL:5]], hoàn cọc [[HOAN:5]]. ' +
      'Liên hệ [[PK:hotline]] hoặc [[PK:email]]. Giữ chỗ [[CS:giuCho]], đổi lịch [[CS:doiLich]].';
    expect(ruleOf(text)).toBe('OK');
  });

  it('B2-18: câu thuần chữ, không chỗ giữ, qua', () => {
    expect(
      ruleOf('Phòng khám có nhiều chuyên khoa, bạn hãy xem ở trang tra cứu.'),
    ).toBe('OK');
  });

  it('B2-19: kết quả tất định và không đổi đầu vào', () => {
    const text = 'Bác sĩ Nguyễn Văn A';
    expect(verifyAnswer(text, guard)).toEqual(verifyAnswer(text, guard));
    expect(text).toBe('Bác sĩ Nguyễn Văn A');
  });
});

describe('chatbot B2 — V2: chỗ giữ', () => {
  it.each([
    ['id không có trong ngữ cảnh', 'Gặp [[BS:999]] nhé'],
    ['loại lạ', 'Gặp [[XX:12]] nhé'],
    ['chữ thường', 'Gặp [[bs:12]] nhé'],
    ['khoảng trắng', 'Gặp [[BS: 12]] nhé'],
    ['[[ dở dang', 'Gặp [[BS:12 nhé'],
    [']] dở dang', 'Gặp BS:12]] nhé'],
    ['id không phải số', 'Gặp [[BS:abc]] nhé'],
    ['khoá chữ lạ', 'Gọi [[PK:diaChi]] nhé'],
    [
      'chuyên khoa đang hoạt động nhưng ngữ cảnh không phát',
      'Khoa [[CK:4]] nhé',
    ],
    ['loại hợp lệ nhưng id khác loại (GIA của chi nhánh)', 'Giá [[GIA:1]] nhé'],
  ])('DCR-02: %s', (_name, text) => {
    expect(ruleOf(text)).toBe('V2');
  });

  it('DCR-02: V2 đứng trước mọi luật khác (câu vừa sai chỗ giữ vừa có chữ số)', () => {
    expect(ruleOf('Gặp [[BS:999]] lúc 7 giờ')).toBe('V2');
  });

  it('B2-20: chỗ giữ bị cắt khỏi chỉ mục (bác sĩ rơi vì trần ký tự) thì V2', () => {
    const trimmed: VerifierContext = {
      ...guard,
      index: createContextIndex(
        refs.filter((ref) => ref.kind !== 'BS'),
        SPECIALTIES,
      ),
    };
    expect(verifyAnswer('Gặp [[BS:12]]', trimmed)).toEqual({
      ok: false,
      ruleId: 'V2',
    });
  });

  it('B2-21: mô hình tự chèn ký tự giữ chỗ nội bộ để lách luật chữ là V2', () => {
    expect(ruleOf('chuyên khoa huyết học')).toBe('V2');
  });
});

describe('chatbot B2 — V3: chữ số', () => {
  it.each([
    'Giá 200.000 đồng',
    'Mở lúc 7 giờ sáng',
    'Mở lúc ７ giờ',
    'Mở lúc ٧ giờ',
    'Gọi 1150 ngay',
    'Gọi 2115 ngay',
    'Gọi 11 5 ngay',
    // "115" lặp liền nhau không phải số gọi cấp cứu: nếu 115 không có ranh giới thì bỏ hết "115" là không còn chữ số nào (biến thể phụ (i) lộ ra lỗ hổng này)
    'Gọi 115115 ngay',
    'Gọi 115115115 ngay',
    '1. Tim mạch',
    'Chi nhánh Quận 7',
  ])('DCR-03: "%s" bị chặn', (text) => {
    expect(ruleOf(text)).toBe('V3');
  });

  it.each([
    'Nếu khẩn cấp, hãy gọi 115.',
    '115 là số cấp cứu',
    'Hãy gọi 115, 115 hoặc đến cơ sở y tế gần nhất',
    'Gọi 115!',
  ])('DCR-03: "%s" qua (115 đứng riêng)', (text) => {
    expect(ruleOf(text)).toBe('OK');
  });

  it('DCR-03: chữ số lọt cạnh chỗ giữ vẫn bị chặn ("1[[CS:giuCho]]5" không nối thành số hợp lệ)', () => {
    expect(ruleOf('Chờ 1[[CS:giuCho]]5')).toBe('V3');
  });
});

describe('chatbot B2 — V4: chức danh trước từ viết hoa', () => {
  it.each([
    'Bác sĩ Nguyễn Văn A sẽ khám cho bạn',
    'Hãy gặp bác sĩ Trần Minh',
    'Hãy gặp BÁC SĨ Trần Minh',
    'Hãy gặp bac si Tran Minh',
    'TS. Trần Văn B phụ trách',
    'ThS.BS. Lê Hoa phụ trách',
    'BS.CKII Trần Quốc Huy phụ trách',
    'PGS.TS.BS Phạm Gia phụ trách',
    'GS Nguyễn Lan phụ trách',
    'Bác sĩ Tim mạch phụ trách',
  ])('DCR-04: "%s" bị chặn', (text) => {
    expect(ruleOf(text)).toBe('V4');
  });

  it.each([
    'Bạn nên gặp bác sĩ chuyên khoa',
    'Bác sĩ sẽ tư vấn thêm cho bạn',
    'Các bác sĩ của phòng khám đều có chuyên môn',
    'Bạn nên gặp bác sĩ. Tôi có thể giúp gì thêm?',
    'Hãy gặp bác sĩ [[BS:12]] nhé',
    'ths và ts là các chức danh',
  ])('DCR-04: "%s" qua', (text) => {
    expect(ruleOf(text)).toBe('OK');
  });

  it('B2-22: chức danh không phải một từ trọn vẹn thì không tính ("BSD", "TSX")', () => {
    expect(ruleOf('Mã BSD Nguyễn và TSX Lê')).toBe('OK');
  });

  it('B2-23: chữ có dấu tách rời (NFD) và ký tự vô hình không lách được V4', () => {
    expect(ruleOf('Bác sĩ Trần Minh'.normalize('NFD'))).toBe('V4');
    expect(ruleOf('B​ác sĩ Trần Minh')).toBe('V4');
  });
});

describe('chatbot B2 — V5: sau "chuyên khoa"', () => {
  it('DCR-05: tên chuyên khoa không có bị chặn', () => {
    expect(ruleOf('Bạn nên khám chuyên khoa huyết học')).toBe('V5');
    expect(ruleOf('Bạn nên khám chuyên khoa Da liễu')).toBe('V5');
  });

  it.each([
    'Bạn nên khám chuyên khoa Tim mạch',
    'Bạn nên khám chuyên khoa tim mach',
    'Bạn nên khám CHUYÊN KHOA TIM MẠCH',
    'Bạn nên khám chuyên khoa Nhi khoa',
    'Bạn nên khám chuyên khoa Tim mạch lão khoa',
    'Bạn nên khám chuyên khoa [[CK:3]]',
  ])('DCR-05: "%s" qua (tên có thật hoặc chỗ giữ)', (text) => {
    expect(ruleOf(text)).toBe('OK');
  });

  it.each([
    'Bạn nên chọn chuyên khoa phù hợp',
    'Bạn muốn chuyên khoa nào',
    'Có chuyên khoa khác không',
    'Chuyên khoa này rất đông',
    'Chuyên khoa đó có bác sĩ',
    'Phòng khám có nhiều chuyên khoa.',
    'Các chuyên khoa',
    'Chuyên khoa, bác sĩ và dịch vụ',
  ])('DCR-05: "%s" qua (từ nối của PLAN, dấu câu hay hết câu)', (text) => {
    expect(ruleOf(text)).toBe('OK');
  });

  it.each([
    ['từ nối ngoài PLAN', 'Bác sĩ chuyên khoa sẽ tư vấn cho bạn'],
    ['từ nối ngoài PLAN (của)', 'Chuyên khoa của chúng tôi rất đa dạng'],
    ['tên khoa viết khác "Nhi khoa"', 'Bạn nên khám chuyên khoa nhi'],
  ])('B2-24: ca nhập nhằng đã biết, theo PLAN thì chặn (%s)', (_name, text) => {
    expect(ruleOf(text)).toBe('V5');
  });

  it('B2-25: không có chuyên khoa đang hoạt động nào thì mọi tên đều bị chặn', () => {
    const empty: VerifierContext = {
      ...guard,
      index: createContextIndex(refs, new Map()),
    };
    expect(verifyAnswer('Bạn nên khám chuyên khoa Tim mạch', empty)).toEqual({
      ok: false,
      ruleId: 'V5',
    });
  });
});

describe('chatbot B2 — V6: URL, email, HTML, liên kết markdown', () => {
  it.each([
    ['https', 'Xem tại https://example.test/trang'],
    ['http', 'Xem tại http://example.test'],
    ['www', 'Xem tại www.example.test'],
    ['email', 'Gửi thư đến ten.nguoi@example.test nhé'],
    ['thẻ img', 'Xin chào <img src=x onerror=alert> bạn'],
    ['thẻ b', 'Đây là <b>chữ đậm</b>'],
    ['thẻ đóng', 'Hết </div> rồi'],
    ['chú thích html', 'Ẩn <!-- ghi chú --> đi'],
    ['liên kết markdown', 'Bấm [vào đây](đường-dẫn) nhé'],
    ['tên miền trần', 'Truy cập clinix.com để biết thêm'],
    ['tên miền .vn', 'Truy cập clinix.vn để biết thêm'],
    [
      'tiền tố khối dữ liệu bị lặp lại',
      'Đây là <<<BAT_DAU_DU_LIEU_CONG_KHAI>>>',
    ],
  ])('DCR-06: %s bị chặn', (_name, text) => {
    expect(ruleOf(text)).toBe('V6');
  });

  it.each([
    'Tim & mạch là hai khoa',
    'Nếu a < b thì chọn b',
    'R&D không phải chuyên khoa',
    'Khám nội tiết & tiêu hóa',
    'Xem phần [ghi chú] bên dưới',
  ])('DCR-12: "%s" qua, ký tự `<` và `&` hợp lệ giữ là chữ', (text) => {
    expect(ruleOf(text)).toBe('OK');
  });
});

describe('chatbot B2 — V7: khẳng định hệ thống không chứng được', () => {
  it.each([
    'Phòng khám mở cả chủ nhật',
    'Phòng khám mở thứ hai đến thứ sáu',
    'Phòng khám nghỉ thứ bảy',
    'Phòng khám làm việc cuối tuần',
    'Phòng khám nghỉ ngày lễ',
    'Dịch vụ này miễn phí',
    'Có giảm giá cho bạn',
    'Đang có khuyến mãi',
    'Đây là bác sĩ giỏi nhất',
    'Đây là lựa chọn tốt nhất',
    'Dich vu nay mien phi',
    'Phong kham mo chu nhat',
    'Phòng khám mi​ễn phí cho bạn',
  ])('DCR-07: "%s" bị chặn', (text) => {
    expect(ruleOf(text)).toBe('V7');
  });

  it('B2-26: "thứ" không đi cùng tên thứ không bị chặn ("thứ tự", "một thứ")', () => {
    expect(ruleOf('Theo thứ tự ưu tiên và một thứ khác')).toBe('OK');
  });
});

describe('chatbot B2 — V8: chẩn đoán và kê đơn', () => {
  it.each([
    'Bạn bị viêm họng rồi',
    'Bạn nên uống hai viên mỗi ngày',
    'Bạn uống ba viên là đủ',
    'Liều dùng là vừa đủ',
    'Chẩn đoán là viêm xoang',
    'Tôi sẽ kê đơn cho bạn',
    'Bạn bi viem hong',
  ])('DCR-08: "%s" bị chặn', (text) => {
    expect(ruleOf(text)).toBe('V8');
  });

  it.each([
    'Trợ lý không kê đơn',
    'Trợ lý AI không chẩn đoán và không kê đơn',
    'Trợ lý KHÔNG KÊ ĐƠN thuốc',
  ])('DCR-08: "%s" qua (dạng phủ định)', (text) => {
    expect(ruleOf(text)).toBe('OK');
  });

  it('DCR-08: "uống" và "viên" cách nhau quá ba từ thì không phải cụm "uống … viên"', () => {
    expect(ruleOf('Uống thật nhiều nước rồi mới gặp viên chức')).toBe('OK');
    expect(ruleOf('Uống một hai ba viên')).toBe('V8');
    expect(ruleOf('Uống một hai ba bốn viên')).toBe('OK');
  });

  it.each(['dữ liệu', 'tài liệu', 'trị liệu', 'liệu trình'])(
    'B2-27: từ có dấu "%s" PHẢI qua dù danh sách có "liều" (bài học AI-BUG-128 của B1)',
    (word) => {
      expect(ruleOf(`Bạn xem ${word} ở trang chủ`)).toBe('OK');
    },
  );

  it('B2-28: câu gõ KHÔNG DẤU có từ "lieu" bị V8 chặn (cố ý, thà chặn thừa; lời nhắc B3 phải bắt mô hình viết có dấu)', () => {
    expect(ruleOf('Ban xem du lieu o trang chu')).toBe('V8');
    expect(ruleOf('Goi tri lieu bao lau')).toBe('V8');
  });

  it('B2-29: "liều lượng", "liều lĩnh" có dấu bị chặn (từ "liều" đứng riêng)', () => {
    expect(ruleOf('Liều lượng tuỳ người')).toBe('V8');
  });
});

describe('chatbot B2 — V9: lộ lời nhắc hệ thống', () => {
  it('DCR-09: chứa mã chim mồi bị chặn, kể cả chữ thường hay xen khoảng trắng và ký tự vô hình', () => {
    expect(ruleOf(`Mã của tôi là ${CANARY}`)).toBe('V9');
    expect(ruleOf(`mã là ${CANARY.toLowerCase()}`)).toBe('V9');
    expect(ruleOf(`mã là ${CANARY.slice(0, 6)}​${CANARY.slice(6)}`)).toBe('V9');
  });

  it('DCR-09: chứa một đoạn 40 ký tự liên tiếp của lời nhắc bị chặn', () => {
    const fragment = PROMPT.slice(10, 50);
    expect(fragment).toHaveLength(40);
    expect(ruleOf(`Lời nhắc của tôi: ${fragment}`)).toBe('V9');
  });

  it('DCR-09: đoạn 39 ký tự thì qua (biên)', () => {
    const fragment = PROMPT.slice(10, 49);
    expect(fragment).toHaveLength(39);
    expect(ruleOf(`Lời nhắc của tôi: ${fragment}`)).toBe('OK');
  });

  it('DCR-09: đoạn lời nhắc gõ không dấu, khác hoa thường, thừa khoảng trắng vẫn bị bắt', () => {
    const fragment = PROMPT.slice(10, 70).toUpperCase().replace(/ /g, '   ');
    expect(ruleOf(fragment)).toBe('V9');
  });

  it('B2-30: lời nhắc rỗng thì chỉ kiểm mã chim mồi', () => {
    const noPrompt = { ...guard, protectedPrompt: '' };
    expect(verifyAnswer('Chào bạn', noPrompt)).toEqual({ ok: true });
    expect(verifyAnswer(`x ${CANARY}`, noPrompt)).toEqual({
      ok: false,
      ruleId: 'V9',
    });
  });

  it('B2-31: mã chim mồi rỗng hay quá ngắn là cấu hình sai: ném lỗi thay vì âm thầm tắt bảo vệ', () => {
    for (const canary of ['', '   ', 'abc', '1234567']) {
      expect(() => verifyAnswer('Chào bạn', { ...guard, canary })).toThrow(
        RangeError,
      );
    }
    expect(() =>
      verifyAnswer('Chào bạn', { ...guard, canary: '12345678' }),
    ).not.toThrow();
  });
});

describe('chatbot B2 — thứ tự luật', () => {
  it('B2-32: nhiều luật cùng vi phạm thì ghi luật ĐẦU TIÊN theo thứ tự V2, V3, V4, V5, V6, V7, V8, V9', () => {
    expect(ruleOf('Giá 200 đồng, miễn phí')).toBe('V3');
    expect(ruleOf('Bác sĩ Lê Hoa miễn phí')).toBe('V4');
    expect(ruleOf('chuyên khoa huyết học miễn phí')).toBe('V5');
    expect(ruleOf('Xem https://example.test miễn phí')).toBe('V6');
    expect(ruleOf('miễn phí, bạn bị bệnh')).toBe('V7');
    expect(ruleOf(`bạn bị bệnh ${CANARY}`)).toBe('V8');
  });
});
