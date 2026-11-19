import {
  applyDateChange,
  isCompleteInvalidDate,
  isoToDisplay,
  isRealIsoDate,
  maskDate,
  parseDisplayDate,
  parsePastedDate,
} from './date-format';

// UX1-10 đến UX1-24 (doctor UX1, G5): phần thuần của ô ngày dd/mm/yyyy. Giá trị trong state và API luôn là `YYYY-MM-DD`; ô chỉ đổi cách GÕ và HIỂN THỊ.
// Khuôn như ô giờ 24h (`admin/branches/time-format.test.ts`): mặt nạ khi gõ, con trỏ đếm theo chữ số.

describe('isRealIsoDate', () => {
  it.each([
    '2024-02-29',
    '2000-02-29',
    '2026-12-31',
    '2026-01-01',
    '2026-04-30',
    '2026-02-28',
  ])('UX1-10 %s là ngày có thật', (iso) => {
    expect(isRealIsoDate(iso)).toBe(true);
  });

  it.each([
    ['2023-02-29', '29/02 năm không nhuận'],
    ['1900-02-29', '1900 chia hết 100 mà không chia hết 400: không nhuận'],
    ['2026-04-31', 'tháng 4 chỉ có 30 ngày'],
    ['2026-02-31', '31/02'],
    ['2026-00-10', 'tháng 0'],
    ['2026-13-01', 'tháng 13'],
    ['2026-01-00', 'ngày 0'],
    ['0000-01-01', 'năm 0'],
    ['2026-1-1', 'thiếu số 0'],
    ['abc', 'không phải ngày'],
    ['', 'rỗng'],
  ])('UX1-10 ca âm: %s không phải ngày có thật (%s)', (iso) => {
    expect(isRealIsoDate(iso)).toBe(false);
  });
});

describe('parseDisplayDate và isoToDisplay', () => {
  it('UX1-11 dd/mm/yyyy ⇒ YYYY-MM-DD; ngày > 12 chứng minh thứ tự dd rồi mm (không hoán)', () => {
    expect(parseDisplayDate('24/11/2026')).toBe('2026-11-24');
    expect(parseDisplayDate('13/02/2026')).toBe('2026-02-13');
    expect(parseDisplayDate('01/12/2026')).toBe('2026-12-01');
  });

  it.each([
    ['31/02/2026', 'ngày không tồn tại'],
    ['31/04/2026', 'tháng 4 chỉ có 30 ngày'],
    ['29/02/2027', 'không nhuận'],
    ['1/2/2026', 'thiếu số 0: chỉ nhận dạng đủ chữ số'],
    ['24/11/26', 'năm hai chữ số'],
    ['24-11-2026', 'sai dấu phân cách'],
    ['2026-11-24', 'ISO không phải dạng hiển thị'],
    ['', 'rỗng'],
  ])('UX1-11 ca âm: %s ⇒ null (%s)', (text) => {
    expect(parseDisplayDate(text)).toBeNull();
  });

  it('UX1-12 YYYY-MM-DD ⇒ dd/mm/yyyy; rỗng, sai dạng hay ngày không có thật ⇒ rỗng', () => {
    expect(isoToDisplay('2026-11-24')).toBe('24/11/2026');
    expect(isoToDisplay('2024-02-29')).toBe('29/02/2024');
    expect(isoToDisplay('')).toBe('');
    expect(isoToDisplay('abc')).toBe('');
    expect(isoToDisplay('2026-02-30')).toBe('');
  });

  it('UX1-12 isCompleteInvalidDate: chỉ đủ 10 ký tự mà không có thật mới là "sai"; dở dang hay hợp lệ thì không', () => {
    expect(isCompleteInvalidDate('31/02/2026')).toBe(true);
    expect(isCompleteInvalidDate('29/02/2027')).toBe(true);
    expect(isCompleteInvalidDate('24/11/2026')).toBe(false);
    expect(isCompleteInvalidDate('24/11/20')).toBe(false);
    expect(isCompleteInvalidDate('')).toBe(false);
  });
});

describe('maskDate (gõ)', () => {
  it.each([
    ['', ''],
    ['2', '2'],
    ['3', '3'],
    ['24', '24/'],
    ['241', '24/1'],
    ['2411', '24/11/'],
    ['24112', '24/11/2'],
    ['2411202', '24/11/202'],
    ['24112026', '24/11/2026'],
  ])(
    'UX1-13 gõ từng chữ số: "%s" ⇒ "%s" (tự thêm / sau 2 chữ số ngày và 2 chữ số tháng)',
    (raw, expected) => {
      expect(maskDate(raw, false)).toBe(expected);
    },
  );

  it('UX1-14 dư chữ số bị bỏ: tối đa 8 chữ số', () => {
    expect(maskDate('241120261', false)).toBe('24/11/2026');
    expect(maskDate('24/11/20269999', false)).toBe('24/11/2026');
  });

  it.each([
    ['4', '04/'],
    ['9', '09/'],
    ['24/4', '24/04/'],
    ['24/9', '24/09/'],
    ['24/1', '24/1'],
    ['3', '3'],
  ])(
    'UX1-15 số đầu của ngày > 3 hoặc của tháng > 1 tự thêm 0: "%s" ⇒ "%s"',
    (raw, expected) => {
      expect(maskDate(raw, false)).toBe(expected);
    },
  );

  it.each([
    ['24/21/2026', '24/21/2026'],
    ['44/11/2026', '44/11/2026'],
    ['24/99/2026', '24/99/2026'],
    ['4211', '04/02/11'],
  ])(
    'UX1-15b ô ĐÃ có dấu / hai bên thì KHÔNG bù 0 (sửa giữa chừng "24/11/2026" thành "24/21/2026" không được ra "24/02/1202"); chuỗi chữ số liền thì vẫn bù: "%s" ⇒ "%s"',
    (raw, expected) => {
      expect(maskDate(raw, false)).toBe(expected);
    },
  );

  it.each([
    ['1/', '01/'],
    ['1/2/2026', '01/02/2026'],
    ['1.2.2026', '01/02/2026'],
    ['1-2-2026', '01/02/2026'],
    ['24//11', '24/11/'],
    ['24/11/', '24/11/'],
  ])(
    'UX1-16 dấu phân cách gõ tay (/ . -) bù 0 và không nhân đôi: "%s" ⇒ "%s"',
    (raw, expected) => {
      expect(maskDate(raw, false)).toBe(expected);
    },
  );

  it('UX1-16 dấu / có sẵn khi ĐANG XOÁ không bù 0: xoá một chữ số của "11" ra "24/1/2026" (giữ nguyên), còn gõ tay "24/1/2026" thì bù thành "24/01/2026"', () => {
    expect(maskDate('24/1/2026', true)).toBe('24/1/2026');
    expect(maskDate('24/1/2026', false)).toBe('24/01/2026');
  });

  it('UX1-16 ca âm: chữ cái và ký tự lạ bị bỏ; dấu phân cách đứng đầu (chưa có chữ số) bị bỏ', () => {
    expect(maskDate('ab24', false)).toBe('24/');
    expect(maskDate('/24', false)).toBe('24/');
    expect(maskDate('abc', false)).toBe('');
    expect(maskDate('@#$', false)).toBe('');
  });

  it.each([
    ['24', '24'],
    ['24/', '24/'],
    ['2411', '24/11'],
    ['24/11', '24/11'],
    ['24112', '24/11/2'],
    ['4', '4'],
  ])(
    'UX1-17 đang xoá: "%s" ⇒ "%s" (không tự chèn lại / sau chữ số cuối, không bù 0 cho số đơn)',
    (raw, expected) => {
      expect(maskDate(raw, true)).toBe(expected);
    },
  );
});

describe('parsePastedDate (dán, tự điền)', () => {
  it.each([
    ['24/11/2026', '24/11/2026'],
    ['1/2/2026', '01/02/2026'],
    ['24-11-2026', '24/11/2026'],
    ['24.11.2026', '24/11/2026'],
    ['24112026', '24/11/2026'],
    ['2026-11-24', '24/11/2026'],
    ['  24/11/2026  ', '24/11/2026'],
    ['30/02/2026', '30/02/2026'],
    ['2026-02-30', '30/02/2026'],
  ])(
    'UX1-18 dán "%s" ⇒ "%s" (chưa kiểm ngày có thật: nơi dùng báo riêng)',
    (text, expected) => {
      expect(parsePastedDate(text)).toBe(expected);
    },
  );

  it.each([
    'abc',
    '',
    '24/11',
    '24/11/26',
    '2026/11/24',
    '2026-1-1',
    '24/11/2026 abc',
    '24112026123',
  ])('UX1-19 ca âm: dán "%s" ⇒ null', (text) => {
    expect(parsePastedDate(text)).toBeNull();
  });
});

describe('applyDateChange (gõ, xoá, con trỏ)', () => {
  it('UX1-20 gõ ở cuối: con trỏ ở cuối, kể cả sau / vừa tự chèn', () => {
    expect(applyDateChange('24', '241', 3, 'backward')).toEqual({
      text: '24/1',
      caret: 4,
    });
    expect(applyDateChange('2', '24', 2, 'backward')).toEqual({
      text: '24/',
      caret: 3,
    });
    expect(applyDateChange('', '2', 1, 'backward')).toEqual({
      text: '2',
      caret: 1,
    });
  });

  it('UX1-21 ký tự lạ bị bỏ, ô đứng yên, con trỏ lùi về chỗ cũ', () => {
    expect(applyDateChange('24/1', '24/1a', 5, 'backward')).toEqual({
      text: '24/1',
      caret: 4,
    });
    expect(applyDateChange('24/11', '24/a11', 4, 'backward')).toEqual({
      text: '24/11',
      caret: 3,
    });
  });

  it('UX1-22 xoá chữ số cuối: Backspace từng bước ("24/11" ⇒ "24/1" ⇒ "24/" ⇒ "24" ⇒ "2")', () => {
    expect(applyDateChange('24/11', '24/1', 4, 'backward')).toEqual({
      text: '24/1',
      caret: 4,
    });
    expect(applyDateChange('24/1', '24/', 3, 'backward')).toEqual({
      text: '24/',
      caret: 3,
    });
    expect(applyDateChange('24/', '24', 2, 'backward')).toEqual({
      text: '24',
      caret: 2,
    });
    expect(applyDateChange('24', '2', 1, 'backward')).toEqual({
      text: '2',
      caret: 1,
    });
  });

  it('UX1-23 xoá qua dấu / ở giữa: Backspace xoá chữ số đứng trước, Delete xoá chữ số đứng sau, con trỏ đúng chỗ (ô không đứng yên)', () => {
    // "24/|11" Backspace ⇒ trình duyệt ra "24|11"; mặt nạ dựng lại đúng "24/11" nên xoá thêm chữ số kề con trỏ
    expect(applyDateChange('24/11', '2411', 2, 'backward')).toEqual({
      text: '21/1',
      caret: 1,
    });
    // "24|/11" Delete ⇒ "24|11"
    expect(applyDateChange('24/11', '2411', 2, 'forward')).toEqual({
      text: '24/1',
      caret: 2,
    });
  });

  it('UX1-23 xoá một chữ số của tháng "11" ra "24/1/2026" (trông giống một ngày dán): vẫn là XOÁ, giữ nguyên chữ dở dang, không bù thành "24/01/2026"', () => {
    expect(applyDateChange('24/11/2026', '24/1/2026', 4, 'backward')).toEqual({
      text: '24/1/2026',
      caret: 4,
    });
    expect(applyDateChange('24/11/2026', '4/11/2026', 0, 'forward')).toEqual({
      text: '4/11/2026',
      caret: 0,
    });
  });

  it('UX1-24 sửa giữa chuỗi: con trỏ theo số chữ số đứng trước; chọn hết rồi gõ; dán ISO qua change; xoá sạch', () => {
    expect(applyDateChange('24/11/2026', '24/101/2026', 5, 'backward')).toEqual(
      { text: '24/10/1202', caret: 5 },
    );
    // Chọn hết rồi gõ "5": chuỗi ngắn hơn nên coi là đang xoá (như ô giờ), hiện số đơn; chữ số kế tiếp mới bù 0 và sang tháng
    expect(applyDateChange('24/11/2026', '5', 1, 'backward')).toEqual({
      text: '5',
      caret: 1,
    });
    expect(applyDateChange('5', '52', 2, 'backward')).toEqual({
      text: '05/02/',
      caret: 6,
    });
    expect(applyDateChange('', '2026-10-20', 10, 'backward')).toEqual({
      text: '20/10/2026',
      caret: 10,
    });
    expect(applyDateChange('24/11/2026', '', 0, 'backward')).toEqual({
      text: '',
      caret: 0,
    });
  });

  // Lỗi F1 (trình duyệt thật, 19/11/2026): sửa MỘT ký tự mà kết quả là một ngày đủ khác không phải "dán", nên con trỏ ở lại sau ký tự vừa gõ
  it('UX1-24b chèn MỘT chữ số vào giữa ngày đủ ("24/1/2026" gõ "1" ở vị trí 4 ra "24/11/2026"): con trỏ ở SAU chữ số vừa gõ (5), không nhảy về cuối (10)', () => {
    expect(applyDateChange('24/1/2026', '24/11/2026', 5, 'backward')).toEqual({
      text: '24/11/2026',
      caret: 5,
    });
  });

  it('UX1-24b thay MỘT ký tự trong ngày đủ ("24/11/2026" chọn một chữ số của tháng gõ "2" ra "24/21/2026"): con trỏ sau ký tự vừa gõ (4)', () => {
    expect(applyDateChange('24/11/2026', '24/21/2026', 4, 'backward')).toEqual({
      text: '24/21/2026',
      caret: 4,
    });
    expect(applyDateChange('24/11/2026', '25/11/2026', 2, 'backward')).toEqual({
      text: '25/11/2026',
      caret: 2,
    });
  });

  it('UX1-24b gõ chữ số cuối cùng của ngày ("24/11/202" ra "24/11/2026"): con trỏ ở cuối (10)', () => {
    expect(applyDateChange('24/11/202', '24/11/2026', 10, 'backward')).toEqual({
      text: '24/11/2026',
      caret: 10,
    });
  });

  it('UX1-24b ca âm (vẫn là DÁN, con trỏ ở cuối): tự điền hay dán cả ngày khác hẳn chữ cũ, kể cả khi ô đang có ngày đủ', () => {
    expect(applyDateChange('24/11/2026', '2026-10-20', 10, 'backward')).toEqual(
      { text: '20/10/2026', caret: 10 },
    );
    expect(applyDateChange('', '2026-10-20', 10, 'backward')).toEqual({
      text: '20/10/2026',
      caret: 10,
    });
    expect(applyDateChange('5', '24112026', 8, 'backward')).toEqual({
      text: '24/11/2026',
      caret: 10,
    });
  });
});
