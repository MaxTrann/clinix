import {
  cleanText,
  codePointLength,
  HISTORY_MAX_TURNS,
  HISTORY_TURN_MAX_CODE_POINTS,
  normalizeHistory,
  normalizeQuestion,
  QUESTION_MAX_CODE_POINTS,
} from './question-normalizer.js';

// chatbot B1 — ATY-08 (PLAN chatbot 7.3): chuẩn hoá và giới hạn độ dài câu hỏi (bước 2 của 5.4), hàm thuần.
describe('chatbot B1 — question-normalizer (ATY-08)', () => {
  it('B1-ATY: hằng đúng PLAN (câu 500 điểm mã; lịch sử 6 lượt, mỗi lượt 800)', () => {
    expect(QUESTION_MAX_CODE_POINTS).toBe(500);
    expect(HISTORY_MAX_TURNS).toBe(6);
    expect(HISTORY_TURN_MAX_CODE_POINTS).toBe(800);
  });

  it('ATY-08: 500 điểm mã được nhận, 501 bị từ chối CAU_HOI_QUA_DAI', () => {
    expect(normalizeQuestion('a'.repeat(500))).toEqual({
      ok: true,
      text: 'a'.repeat(500),
    });
    expect(normalizeQuestion('a'.repeat(501))).toEqual({
      ok: false,
      code: 'CAU_HOI_QUA_DAI',
    });
  });

  it('ATY-08: emoji (2 đơn vị UTF-16 nhưng 1 điểm mã) đếm theo điểm mã: 500 nhận, 501 từ chối', () => {
    expect(normalizeQuestion('😀'.repeat(500)).ok).toBe(true);
    expect(normalizeQuestion('a' + '😀'.repeat(499)).ok).toBe(true);
    expect(normalizeQuestion('😀'.repeat(501))).toEqual({
      ok: false,
      code: 'CAU_HOI_QUA_DAI',
    });
    expect(normalizeQuestion('a' + '😀'.repeat(500))).toEqual({
      ok: false,
      code: 'CAU_HOI_QUA_DAI',
    });
  });

  it('ATY-08: đếm SAU chuẩn hoá NFC: chữ có dấu viết tổ hợp (NFD) ghép lại thành một điểm mã', () => {
    const composed = 'ệ'; // một điểm mã dựng sẵn
    const decomposed = composed.normalize('NFD');
    expect(Array.from(decomposed).length).toBeGreaterThan(1);
    // 500 chữ tổ hợp: thô là 1.500 điểm mã nhưng sau NFC chỉ 500
    expect(normalizeQuestion(decomposed.repeat(500))).toEqual({
      ok: true,
      text: composed.repeat(500),
    });
    expect(normalizeQuestion(decomposed.repeat(501)).ok).toBe(false);
  });

  it('ATY-08: ký tự ghép không thể ghép thành một điểm mã vẫn tính từng điểm mã', () => {
    const base = 'x́'; // x + dấu sắc: không có dạng dựng sẵn
    expect(normalizeQuestion(base.repeat(250)).ok).toBe(true); // 500 điểm mã
    expect(normalizeQuestion(base.repeat(251)).ok).toBe(false); // 502
  });

  it('ATY-08: khoảng trắng hai đầu không tính vào độ dài', () => {
    const result = normalizeQuestion(`  \t${'a'.repeat(500)}\n  `);
    expect(result).toEqual({ ok: true, text: 'a'.repeat(500) });
  });

  it.each([
    ['rỗng', ''],
    ['chỉ dấu cách', '     '],
    ['chỉ tab và xuống dòng', '\t\n\r\n \u000b\u000c'],
    ['chỉ ký tự điều khiển', '\u0000\u0007\u001b\u007f'],
  ])('ATY-08: %s ⇒ CAU_HOI_TRONG', (_name, raw) => {
    expect(normalizeQuestion(raw)).toEqual({
      ok: false,
      code: 'CAU_HOI_TRONG',
    });
  });

  it('ATY-08: giá trị không phải chuỗi (JSON lạ) ⇒ CAU_HOI_TRONG, không ném lỗi', () => {
    for (const weird of [undefined, null, 42, {}, ['a']]) {
      expect(normalizeQuestion(weird as unknown as string)).toEqual({
        ok: false,
        code: 'CAU_HOI_TRONG',
      });
    }
  });

  it('ATY-08: ký tự điều khiển bị bỏ (đổi thành dấu cách để từ hai bên không dính nhau); CRLF là MỘT dấu cách', () => {
    const result = normalizeQuestion('đau\u0000ngực\r\nkhó\u0007thở\u001b');
    expect(result).toEqual({ ok: true, text: 'đau ngực khó thở' });
    expect(cleanText('a\u007fb\u0085c')).toBe('a b c');
    expect(/\p{Cc}/u.test(cleanText('\u0001x\u0002y\u0003'))).toBe(false);
  });

  it('ATY-08: ký tự điều khiển ở hai đầu không chiếm chỗ trong 500 điểm mã', () => {
    expect(normalizeQuestion(`\u0000${'a'.repeat(500)}\u0007`).ok).toBe(true);
    expect(normalizeQuestion(`\u0000${'a'.repeat(501)}\u0007`).ok).toBe(false);
  });

  it('ATY-08: chuỗi cực dài bị từ chối nhanh, không ném lỗi', () => {
    const started = Date.now();
    expect(normalizeQuestion('b'.repeat(2_000_000))).toEqual({
      ok: false,
      code: 'CAU_HOI_QUA_DAI',
    });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('ATY-08: giữ nguyên chữ có dấu, chữ hoa và khoảng trắng ở giữa (chuẩn hoá không đổi nội dung)', () => {
    expect(normalizeQuestion('  Khám Nội   tổng quát  ')).toEqual({
      ok: true,
      text: 'Khám Nội   tổng quát',
    });
  });

  it('ATY-08: cắt khoảng trắng ASCII (không cắt U+00A0 như String.trim, đúng nếp của repo)', () => {
    expect(cleanText(' a ')).toBe(' a ');
  });

  it('B1-ATY: codePointLength đếm điểm mã', () => {
    expect(codePointLength('')).toBe(0);
    expect(codePointLength('abc')).toBe(3);
    expect(codePointLength('😀a')).toBe(2);
  });
});

describe('chatbot B1 — normalizeHistory (lịch sử gửi kèm, bước 2 của 5.4; 5.12)', () => {
  const turn = (
    vai: 'NguoiDung' | 'TroLy',
    noiDung: string,
  ): { vai: 'NguoiDung' | 'TroLy'; noiDung: string } => ({ vai, noiDung });

  it('ATY-08: lịch sử rỗng hợp lệ; 6 lượt nhận, 7 lượt từ chối LICH_SU_KHONG_HOP_LE', () => {
    expect(normalizeHistory([])).toEqual({ ok: true, turns: [] });
    const six = Array.from({ length: 6 }, () => turn('NguoiDung', 'xin chào'));
    expect(normalizeHistory(six).ok).toBe(true);
    expect(normalizeHistory([...six, turn('TroLy', 'chào bạn')])).toEqual({
      ok: false,
      code: 'LICH_SU_KHONG_HOP_LE',
    });
  });

  it('ATY-08: mỗi lượt 800 điểm mã nhận, 801 từ chối', () => {
    expect(normalizeHistory([turn('NguoiDung', 'a'.repeat(800))]).ok).toBe(
      true,
    );
    expect(normalizeHistory([turn('TroLy', 'a'.repeat(801))])).toEqual({
      ok: false,
      code: 'LICH_SU_KHONG_HOP_LE',
    });
  });

  it('ATY-08: lượt rỗng, vai lạ, thiếu nội dung, không phải mảng đều bị từ chối', () => {
    const invalid = { ok: false, code: 'LICH_SU_KHONG_HOP_LE' };
    expect(normalizeHistory([turn('NguoiDung', '   ')])).toEqual(invalid);
    expect(
      normalizeHistory([{ vai: 'HeThong', noiDung: 'x' } as never]),
    ).toEqual(invalid);
    expect(normalizeHistory([{ vai: 'TroLy' } as never])).toEqual(invalid);
    expect(normalizeHistory([null as never])).toEqual(invalid);
    expect(normalizeHistory('xin chào' as never)).toEqual(invalid);
    expect(normalizeHistory(undefined as never)).toEqual(invalid);
  });

  it('ATY-08: chuẩn hoá từng lượt như câu hỏi (NFC, ký tự điều khiển, cắt trắng); giữ thứ tự và vai; không sửa đầu vào', () => {
    const input = [
      turn('NguoiDung', '  Bệnh\u0000viện '.normalize('NFD')),
      turn('TroLy', 'ổn\r\nkhông'),
    ];
    const snapshot = JSON.stringify(input);
    expect(normalizeHistory(input)).toEqual({
      ok: true,
      turns: [
        { vai: 'NguoiDung', noiDung: 'Bệnh viện' },
        { vai: 'TroLy', noiDung: 'ổn không' },
      ],
    });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
