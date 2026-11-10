import {
  APPOINTMENT_CODE_PATTERN,
  normalizeAppointmentCode,
  parseAppointmentCode,
} from './appointment-code.js';

// Task B2 — LSH-21 [đề xuất] (PLAN booking 7.4, 7.9 QB-09; TRACKING 3.15.3): chuẩn hoá và kiểm mẫu `maLichHen`. Hàm thuần, không DB. `ſ` (U+017F) và `ı` (U+0131)
// viết bằng mã thoát để người đọc thấy rõ đó không phải chữ `s` và `i` thường.
const CODE = 'CLX-20261110-7K3QD';

describe('LSH-21 normalizeAppointmentCode', () => {
  it.each([
    ['đã đúng dạng', CODE, CODE],
    ['chữ thường', 'clx-20261110-7k3qd', CODE],
    ['lẫn lộn hoa thường', 'cLx-20261110-7K3qD', CODE],
    ['khoảng trắng hai đầu', `  ${CODE}  `, CODE],
    ['tab và xuống dòng hai đầu', `\t${CODE}\r\n`, CODE],
    ['rỗng', '', ''],
  ])('%s', (_name, raw, expected) => {
    expect(normalizeAppointmentCode(raw)).toBe(expected);
  });

  it('chỉ đổi a-z ASCII: ſ (U+017F) và ı (U+0131) giữ nguyên, không biến thành S và I', () => {
    expect(normalizeAppointmentCode('ſ')).toBe('ſ');
    expect(normalizeAppointmentCode('ı')).toBe('ı');
    // toUpperCase() nguyên chuỗi sẽ cho 'S' và 'I': đó chính là lỗ hổng cần tránh
    expect('ſ'.toUpperCase()).toBe('S');
    expect('ı'.toUpperCase()).toBe('I');
  });

  it('không sửa chuỗi đầu vào nào khác ngoài hai việc trên (chữ số, dấu gạch, chữ hoa giữ nguyên)', () => {
    expect(normalizeAppointmentCode('A-1_b')).toBe('A-1_B');
  });
});

describe('LSH-21 parseAppointmentCode và APPOINTMENT_CODE_PATTERN', () => {
  it('mã đúng dạng và dạng chữ thường, có khoảng trắng đều ra đúng mã chuẩn hoá', () => {
    expect(parseAppointmentCode(CODE)).toBe(CODE);
    expect(parseAppointmentCode('clx-20261110-7k3qd')).toBe(CODE);
    expect(parseAppointmentCode(` \t${CODE.toLowerCase()}\n`)).toBe(CODE);
  });

  it('đủ chữ số và mọi ký tự Crockford được phép (0-9, A-H, J, K, M, N, P-T, V-Z)', () => {
    expect(parseAppointmentCode('CLX-20261110-01234')).not.toBeNull();
    expect(parseAppointmentCode('CLX-20261110-56789')).not.toBeNull();
    expect(parseAppointmentCode('CLX-20261110-ABCDE')).not.toBeNull();
    expect(parseAppointmentCode('CLX-20261110-FGHJK')).not.toBeNull();
    expect(parseAppointmentCode('CLX-20261110-MNPQR')).not.toBeNull();
    expect(parseAppointmentCode('CLX-20261110-STVWX')).not.toBeNull();
    expect(parseAppointmentCode('CLX-20261110-YZZZZ')).not.toBeNull();
  });

  it.each([
    ['ký tự cấm I', 'CLX-20261110-IBCDE'],
    ['ký tự cấm L', 'CLX-20261110-LBCDE'],
    ['ký tự cấm O', 'CLX-20261110-OBCDE'],
    ['ký tự cấm U', 'CLX-20261110-UBCDE'],
    ['chữ thường cấm (i) sau khi chuẩn hoá vẫn là I', 'clx-20261110-ibcde'],
    ['thiếu một ký tự cuối', 'CLX-20261110-7K3Q'],
    ['thừa một ký tự cuối', 'CLX-20261110-7K3QDX'],
    ['ngày bảy chữ số', 'CLX-2026111-7K3QD'],
    ['ngày chín chữ số', 'CLX-202611100-7K3QD'],
    ['ngày có chữ cái', 'CLX-2026111A-7K3QD'],
    ['sai tiền tố', 'CLY-20261110-7K3QD'],
    ['không có tiền tố', '20261110-7K3QD'],
    ['thiếu dấu gạch giữa', 'CLX-202611107K3QD'],
    ['rỗng', ''],
    ['chỉ khoảng trắng', '   '],
    ['khoảng trắng ở giữa', 'CLX-20261110- 7K3QD'],
    ['hai mã nối nhau', `${CODE}${CODE}`],
    ['xuống dòng ở giữa (không cắt giữa chuỗi)', 'CLX-20261110-\n7K3QD'],
    ['ký tự NUL', `${CODE}\u0000`],
    ['ſ thay cho S', 'CLX-20261110-ABCDſ'],
    ['ı thay cho I (đã bị cấm)', 'CLX-20261110-ABCDı'],
    ['chữ số Ả Rập trong ngày', 'CLX-٢٠٢٦١١١٠-7K3QD'],
    ['chữ toàn rộng', 'ＣＬＸ-20261110-7K3QD'],
    ['chữ số toàn rộng', 'CLX-２０２６１１１０-7K3QD'],
    ['dài 10.000 ký tự', 'A'.repeat(10_000)],
    [
      'mã đúng dạng nhưng bị đẩy dài bởi khoảng trắng ở giữa',
      `CLX-20261110-7K3Q${' '.repeat(50)}D`,
    ],
  ])('sai dạng ⇒ null: %s', (_name, raw) => {
    expect(parseAppointmentCode(raw)).toBeNull();
  });

  it('mẫu có đúng 18 ký tự và vừa cột `ma_lich_hen` (varchar 20)', () => {
    expect(CODE).toHaveLength(18);
    expect(CODE.length).toBeLessThanOrEqual(20);
    expect(APPOINTMENT_CODE_PATTERN.test(CODE)).toBe(true);
  });

  it('mẫu không phân biệt được chữ thường: chỉ chuẩn hoá mới đưa chữ thường về dạng đúng (M8)', () => {
    expect(APPOINTMENT_CODE_PATTERN.test('clx-20261110-7k3qd')).toBe(false);
    expect(parseAppointmentCode('clx-20261110-7k3qd')).toBe(CODE);
  });
});
