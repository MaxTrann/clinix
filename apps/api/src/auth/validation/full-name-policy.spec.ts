import {
  FULL_NAME_MAX_LENGTH,
  isValidFullName,
  normalizeFullName,
} from './full-name-policy.js';

// Task A5. Test case: DK-08 (thiếu/sai họ tên → 400 đúng trường) ở mức quy tắc. Plan chưa có mã riêng cho họ tên nên (HT-nn) là [đề xuất].
// Ký tự đặc biệt dựng bằng String.fromCodePoint để mã nguồn không chứa ký tự điều khiển hướng chữ hay ký tự vô hình.
const cp = (...codePoints: number[]) => String.fromCodePoint(...codePoints);
const RLO = cp(0x202e); // đảo chiều chữ (Cf)
const ZWSP = cp(0x200b); // khoảng trắng rộng 0 (Cf)
const ZWJ = cp(0x200d); // nối rộng 0 (Cf)
const BOM = cp(0xfeff); // (Cf)
const LINE_SEP = cp(0x2028); // Zl
const PARA_SEP = cp(0x2029); // Zp
const NBSP = cp(0x00a0); // Zs, không phải khoảng trắng ASCII
const IDEOGRAPHIC_SPACE = cp(0x3000); // Zs

const valid = (raw: string) => isValidFullName(normalizeFullName(raw));

describe('họ tên hợp lệ', () => {
  it.each([
    'Nguyễn Văn A',
    'Trần Thị Bích Ngọc',
    "O'Brien-Smith Jr.",
    '李小龍',
    'Đặng',
    'A',
    'Nguyễn Văn A 2', // chỉ cần có ít nhất một chữ cái
  ])('(HT-01) %s được chấp nhận và giữ nguyên', (name) => {
    expect(valid(name)).toBe(true);
    expect(normalizeFullName(name)).toBe(name);
  });

  it('(HT-02) cắt khoảng trắng ASCII hai đầu, giữ dấu cách ở giữa', () => {
    expect(normalizeFullName('  Nguyễn Văn A \t\n')).toBe('Nguyễn Văn A');
    expect(normalizeFullName('Nguyễn  Văn')).toBe('Nguyễn  Văn');
  });

  it('(HT-02) khoảng trắng Unicode ở đầu/cuối (U+00A0) KHÔNG bị cắt: cùng nguyên tắc với email và SĐT', () => {
    expect(normalizeFullName(`${NBSP}An`)).toBe(`${NBSP}An`);
  });
});

describe('chuẩn hoá NFC', () => {
  const composed = `Nguy${cp(0x1ec5)}n V${cp(0x0103)}n A`;
  const decomposed = `Nguye${cp(0x0302, 0x0303)}n Va${cp(0x0306)}n A`;

  it('(HT-03) dạng tổ hợp và dạng dựng sẵn của cùng một tên cho ra CÙNG giá trị lưu', () => {
    expect(decomposed).not.toBe(composed); // hai chuỗi khác nhau lúc gõ vào
    expect(decomposed.length).toBeGreaterThan(composed.length);
    expect(normalizeFullName(decomposed)).toBe(composed);
    expect(normalizeFullName(composed)).toBe(composed);
    expect(valid(decomposed)).toBe(true);
  });

  it('(HT-03) chuẩn hoá lặp lại không đổi thêm (idempotent)', () => {
    const once = normalizeFullName(decomposed);
    expect(normalizeFullName(once)).toBe(once);
  });

  it('(HT-04) độ dài đếm SAU khi chuẩn hoá: 34 chữ tổ hợp (102 điểm mã thô) chỉ còn 34 ký tự nên hợp lệ', () => {
    const raw = `e${cp(0x0302, 0x0303)}`.repeat(34);
    expect(Array.from(raw).length).toBe(102);
    expect(Array.from(normalizeFullName(raw)).length).toBe(34);
    expect(valid(raw)).toBe(true);
  });
});

describe('độ dài tối đa (ho_ten varchar(100))', () => {
  it('(HT-05) hằng số khớp cột', () => {
    expect(FULL_NAME_MAX_LENGTH).toBe(100);
  });

  it.each([
    [100, true],
    [101, false],
  ])('(HT-05) %i ký tự → hợp lệ = %s', (length, expected) => {
    expect(valid('A'.repeat(length))).toBe(expected);
  });

  it.each([
    [100, true],
    [101, false],
  ])(
    '(HT-05) đếm theo ký tự, không theo đơn vị UTF-16: %i chữ ngoài mặt phẳng cơ bản → hợp lệ = %s',
    (length, expected) => {
      const name = cp(0x20000).repeat(length); // chữ Hán mở rộng B, mỗi chữ chiếm 2 đơn vị UTF-16
      expect(name.length).toBe(length * 2);
      expect(valid(name)).toBe(expected);
    },
  );

  it('(HT-05) 101 chữ dựng sẵn → từ chối', () => {
    expect(valid(cp(0x1ec5).repeat(101))).toBe(false);
  });
});

describe('họ tên không hợp lệ', () => {
  it.each([
    ['rỗng', ''],
    ['toàn dấu cách', '     '],
    ['toàn khoảng trắng ASCII (tab, xuống dòng)', ' \t\n\r '],
    ['toàn khoảng trắng Unicode', `${NBSP}${IDEOGRAPHIC_SPACE}${NBSP}`],
    ['chỉ chữ số', '12345'],
    ['chỉ dấu câu', "-'. ,"],
  ])('(HT-06) %s → từ chối (phải có ít nhất một chữ cái)', (_label, raw) => {
    expect(valid(raw)).toBe(false);
  });

  it.each([
    ['U+202E đảo chiều chữ (Cf)', `Nguy${RLO}n Van`],
    ['U+200B khoảng trắng rộng 0 (Cf)', `Nguy${ZWSP}n Van`],
    ['U+200D nối rộng 0 (Cf)', `Nguy${ZWJ}n Van`],
    ['U+FEFF dấu thứ tự byte (Cf)', `${BOM}Nguyen`],
    ['tab ở giữa (Cc)', 'Nguyen\tVan'],
    ['xuống dòng ở giữa (Cc)', 'Nguyen\nVan'],
    ['ký tự NUL (Cc)', `Nguyen${cp(0)}Van`],
    ['DEL (Cc)', `Nguyen${cp(0x7f)}Van`],
    ['ký tự điều khiển C1 (Cc)', `Nguyen${cp(0x85)}Van`],
    ['U+2028 ngắt dòng (Zl)', `Nguyen${LINE_SEP}Van`],
    ['U+2029 ngắt đoạn (Zp)', `Nguyen${PARA_SEP}Van`],
    [
      'surrogate lẻ (Cs): một chuỗi JSON có thể mang nó',
      `Nguyen${String.fromCharCode(0xd800)}Van`,
    ],
    ['ký tự dùng riêng (Co)', `Nguyen${cp(0xe000)}Van`],
  ])('(HT-07) %s → từ chối', (_label, raw) => {
    expect(valid(raw)).toBe(false);
  });

  it('(HT-07) ký tự vô hình bị từ chối cả khi nằm sát đầu hoặc cuối (không bị cắt đi)', () => {
    expect(valid(`${ZWSP}Nguyen`)).toBe(false);
    expect(valid(`Nguyen${ZWSP}`)).toBe(false);
  });

  it('(HT-08) chỉ giá trị ĐÃ chuẩn hoá mới hợp lệ (cùng nguyên tắc với SĐT): dạng tổ hợp thô không qua isValidFullName', () => {
    const decomposed = `Nguye${cp(0x0302, 0x0303)}n`;
    expect(isValidFullName(decomposed)).toBe(false);
    expect(isValidFullName(normalizeFullName(decomposed))).toBe(true);
  });
});
