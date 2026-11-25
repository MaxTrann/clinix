import {
  formatAppointmentTime,
  formatDoctorName,
  formatVnDateTime,
  formatVnd,
  isZeroMoney,
  remainingAfterDeposit,
  truncateWithEllipsis,
} from './mail-format.js';

// Task B15 — định dạng tiền của `noi_dung` và thư (PLAN booking 5.12; TRACKING 3.37 B15-F). Đơn vị, không DB. Mã `[đề xuất]` `MLT-11` (định dạng dùng chung cho mẫu thư).
describe('MLT-11 formatVnd: dấu chấm ngăn nghìn, không số thực', () => {
  it.each([
    ['0', '0'],
    ['0.00', '0'],
    ['999.00', '999'],
    ['1000.00', '1.000'],
    ['350000.00', '350.000'],
    ['100000', '100.000'],
    ['1234567.00', '1.234.567'],
    ['1000000000.00', '1.000.000.000'],
  ])('%s ⇒ %s', (input, expected) => {
    expect(formatVnd(input)).toBe(expected);
  });

  it('có phần lẻ thì giữ hai chữ số sau dấu phẩy (không làm tròn)', () => {
    expect(formatVnd('350000.50')).toBe('350.000,50');
    expect(formatVnd('999.99')).toBe('999,99');
    expect(formatVnd('1234567.05')).toBe('1.234.567,05');
  });

  it('chuỗi không phải số tiền không âm thì ném lỗi, không đoán', () => {
    for (const bad of ['', '-5', 'abc', '1,000', '1.234.567', '10.123'])
      expect(() => formatVnd(bad), bad).toThrow();
  });
});

describe('MLT-11 isZeroMoney', () => {
  it.each(['0', '0.00', '000.0', '0.0'])('%s là 0', (value) => {
    expect(isZeroMoney(value)).toBe(true);
  });

  it.each(['0.01', '1', '50000.00'])('%s không phải 0', (value) => {
    expect(isZeroMoney(value)).toBe(false);
  });
});

describe('MLT-11 formatAppointmentTime: thứ theo DAYOFWEEK của MySQL (1 = Chủ nhật)', () => {
  const at = (thu: number) =>
    formatAppointmentTime({ thu, ngay: '10/11/2026', gio: '09:30' });

  it.each([
    [1, 'Chủ Nhật'],
    [2, 'Thứ Hai'],
    [3, 'Thứ Ba'],
    [4, 'Thứ Tư'],
    [5, 'Thứ Năm'],
    [6, 'Thứ Sáu'],
    [7, 'Thứ Bảy'],
  ])('thứ %i ⇒ %s', (thu, name) => {
    expect(at(thu)).toBe(`${name}, 10/11/2026 — 09:30`);
  });

  it('thứ ngoài 1 đến 7 thì ném lỗi, không in "undefined"', () => {
    for (const bad of [0, 8, -1])
      expect(() => at(bad), String(bad)).toThrow(RangeError);
  });
});

describe('MLT-11 formatDoctorName và remainingAfterDeposit', () => {
  it.each([
    ['BS', 'BS. An'],
    ['BS_CKI', 'BS.CKI An'],
    ['BS_CKII', 'BS.CKII An'],
    ['ThS_BS', 'ThS.BS. An'],
    ['TS_BS', 'TS.BS. An'],
    ['PGS_TS_BS', 'PGS.TS.BS. An'],
    ['GS_TS_BS', 'GS.TS.BS. An'],
  ] as const)('%s ⇒ %s', (chucDanh, expected) => {
    expect(formatDoctorName(chucDanh, 'An')).toBe(expected);
  });

  it('giá trừ cọc bằng BigInt, không âm', () => {
    expect(remainingAfterDeposit('350000.00', '100000.00')).toBe('250000.00');
    expect(remainingAfterDeposit('350000.00', '0.00')).toBe('350000.00');
    expect(remainingAfterDeposit('350000.00', '350000.00')).toBe('0.00');
    expect(remainingAfterDeposit('100000.00', '150000.00')).toBe('0.00');
    expect(remainingAfterDeposit('0.10', '0.03')).toBe('0.07');
  });
});

// reschedule B3 — hai hàm dùng chung của câu chữ đổi lịch (NDL-09 giờ Việt Nam; NDL-06 cắt không chẻ cặp thay thế). Đơn vị, không DB.
describe('NDL-09 formatVnDateTime: "HH:mm dd/MM/yyyy" theo giờ Việt Nam, không phụ thuộc múi giờ máy', () => {
  it.each([
    ['2026-11-10T08:00:00+07:00', '08:00 10/11/2026'],
    ['2026-11-10T01:05:00Z', '08:05 10/11/2026'],
    // gần nửa đêm: UTC còn ngày 10, giờ Việt Nam đã sang ngày 11
    ['2026-11-10T16:59:00Z', '23:59 10/11/2026'],
    ['2026-11-10T17:00:00Z', '00:00 11/11/2026'],
    ['2026-12-31T17:30:00Z', '00:30 01/01/2027'],
  ])('%s ⇒ %s', (instant, expected) => {
    expect(formatVnDateTime(new Date(instant))).toBe(expected);
  });
});

describe('NDL-06 truncateWithEllipsis: cắt theo đơn vị UTF-16, thêm "…", không chẻ cặp thay thế', () => {
  it('đủ chỗ (kể cả đúng bằng giới hạn) thì giữ nguyên', () => {
    expect(truncateWithEllipsis('abc', 3)).toBe('abc');
    expect(truncateWithEllipsis('abc', 10)).toBe('abc');
    expect(truncateWithEllipsis('', 0)).toBe('');
  });

  it('vượt thì kết quả đúng `maxUnits` đơn vị, kết thúc bằng "…"', () => {
    expect(truncateWithEllipsis('abcdef', 4)).toBe('abc…');
    expect(truncateWithEllipsis('abcdef', 5)).toHaveLength(5);
    expect(truncateWithEllipsis('abcdef', 1)).toBe('…');
    expect(truncateWithEllipsis('abcdef', 0)).toBe('');
  });

  it('chỗ cắt rơi GIỮA cặp thay thế (emoji): bỏ cả nửa cặp, không để lại ký tự hỏng', () => {
    // 'ab' + 😀 (2 đơn vị) + 'cd': giữ 3 đơn vị = 'ab' + nửa cao của emoji
    const cut = truncateWithEllipsis('ab😀cd', 4);
    expect(cut).toBe('ab…');
    expect(cut).not.toMatch(/[\uD800-\uDFFF]/);
  });

  it('emoji nằm trọn trong phần giữ thì được giữ', () => {
    expect(truncateWithEllipsis('ab😀cd', 5)).toBe('ab😀…');
  });
});
