import { isTime } from './branch-schedule-validation';
import { applyTimeChange, maskTime, normalizeTime } from './time-format';

// AF6-01 (admin PR2 mục 6.4): ô giờ 24h gõ tay. Mặt nạ khi gõ, chuẩn hóa khi rời ô, xóa dấu `:` (điều kiện A của phiên kiểm).

describe('isTime (cùng quy tắc với API và validateWeeklySchedule)', () => {
  it.each(['00:00', '08:00', '12:59', '23:59'])('AF6-01 %s hợp lệ', (value) => {
    expect(isTime(value)).toBe(true);
  });

  it.each([
    '24:00',
    '12:60',
    '25:00',
    '7:00',
    '08:0',
    '8:00',
    '08:00:00',
    '0800',
    '',
    '08-00',
  ])('AF6-01 %j không hợp lệ', (value) => {
    expect(isTime(value)).toBe(false);
  });
});

describe('maskTime (khi gõ)', () => {
  it.each([
    ['', ''],
    ['0', '0'],
    ['1', '1'],
    ['2', '2'],
    ['ab', ''],
  ])('AF6-01 %j ⇒ %j', (raw, expected) => {
    expect(maskTime(raw, false)).toBe(expected);
  });

  it.each([
    ['3', '03:'],
    ['8', '08:'],
    ['9', '09:'],
  ])(
    'AF6-01 chữ số đầu 3–9 tự thêm số 0 và dấu hai chấm: %j ⇒ %j',
    (raw, expected) => {
      expect(maskTime(raw, false)).toBe(expected);
    },
  );

  it.each([
    ['08', '08:'],
    ['13', '13:'],
    ['23', '23:'],
    ['25', '25:'],
  ])(
    'AF6-01 đủ 2 chữ số giờ thì chèn dấu hai chấm: %j ⇒ %j',
    (raw, expected) => {
      expect(maskTime(raw, false)).toBe(expected);
    },
  );

  it.each([
    ['083', '08:3'],
    ['0830', '08:30'],
    ['08300', '08:30'],
    ['1330', '13:30'],
  ])('AF6-01 gõ liền không dấu: %j ⇒ %j', (raw, expected) => {
    expect(maskTime(raw, false)).toBe(expected);
  });

  it.each([
    ['800', '08:00'],
    ['830', '08:30'],
    ['8300', '08:30'],
  ])('AF6-01 giờ một chữ số gõ liền: %j ⇒ %j', (raw, expected) => {
    expect(maskTime(raw, false)).toBe(expected);
  });

  it.each([
    ['8:', '8:'],
    ['8:00', '8:00'],
    ['1:30', '1:30'],
    ['08:30', '08:30'],
    ['08::30', '08:30'],
    ['0a8', '08:'],
  ])(
    'AF6-01 dấu hai chấm người dùng tự gõ được giữ: %j ⇒ %j',
    (raw, expected) => {
      expect(maskTime(raw, false)).toBe(expected);
    },
  );

  it('AF6-01 đang xóa thì KHÔNG tự chèn lại dấu hai chấm sau 2 chữ số', () => {
    expect(maskTime('08', true)).toBe('08');
    expect(maskTime('8', true)).toBe('8');
  });
});

describe('normalizeTime (khi rời ô)', () => {
  it.each([
    ['800', '08:00'],
    ['830', '08:30'],
    ['0800', '08:00'],
    ['8:00', '08:00'],
    ['1:30', '01:30'],
    ['08:30', '08:30'],
    ['23:59', '23:59'],
  ])('AF6-01 %j ⇒ %j', (text, expected) => {
    expect(normalizeTime(text)).toBe(expected);
  });

  it.each(['', '8', '08', '08:', '08:3', '8:75', '80:0', 'abc'])(
    'AF6-01 %j không đoán, để nguyên để báo lỗi ở lần Lưu',
    (text) => {
      expect(normalizeTime(text)).toBe(text);
    },
  );

  it('AF6-01 chuẩn hóa không quyết định hợp lệ: 24:00 và 12:60 vẫn để nguyên và vẫn sai', () => {
    expect(normalizeTime('24:00')).toBe('24:00');
    expect(isTime(normalizeTime('24:00'))).toBe(false);
    expect(normalizeTime('12:60')).toBe('12:60');
    expect(isTime(normalizeTime('12:60'))).toBe(false);
  });
});

describe('applyTimeChange', () => {
  it('AF6-01 gõ "8" vào ô rỗng ⇒ "08:" và con trỏ ở cuối', () => {
    expect(applyTimeChange('', '8', 1, 'backward')).toEqual({
      text: '08:',
      caret: 3,
    });
  });

  it('AF6-01 gõ "0" rồi "8" ⇒ "08:"', () => {
    expect(applyTimeChange('0', '08', 2, 'backward')).toEqual({
      text: '08:',
      caret: 3,
    });
  });

  it('AF6-01 gõ phút sau dấu hai chấm', () => {
    expect(applyTimeChange('08:', '08:3', 4, 'backward')).toEqual({
      text: '08:3',
      caret: 4,
    });
  });

  it('AF6-01 gõ chữ vào ô đã có "08:" thì giá trị không đổi', () => {
    expect(applyTimeChange('08:', '08:a', 4, 'backward')).toEqual({
      text: '08:',
      caret: 3,
    });
  });

  it('AF6-01 tự gõ dấu hai chấm sau 1 chữ số được giữ', () => {
    expect(applyTimeChange('1', '1:', 2, 'backward')).toEqual({
      text: '1:',
      caret: 2,
    });
  });
});

describe('applyTimeChange: xóa dấu `:` (điều kiện A, AF6-02)', () => {
  it('AF6-02 Backspace ngay sau ":" (chỉ mất dấu hai chấm): xóa chữ số đứng trước nó', () => {
    // "08:|30" bấm Backspace ⇒ trình duyệt đưa "08|30"; mặt nạ sẽ dựng lại "08:30" nên ô đứng yên nếu không xóa thêm
    expect(applyTimeChange('08:30', '0830', 2, 'backward')).toEqual({
      text: '03:0',
      caret: 1,
    });
  });

  it('AF6-02 Delete ngay trước ":": xóa chữ số đứng sau nó', () => {
    // "08|:30" bấm Delete ⇒ "08|30"
    expect(applyTimeChange('08:30', '0830', 2, 'forward')).toEqual({
      text: '08:0',
      caret: 2,
    });
  });

  it('AF6-02 Backspace qua ":" ở CUỐI ("08:" ⇒ "08") chỉ bỏ dấu hai chấm, không xóa thêm chữ số', () => {
    expect(applyTimeChange('08:', '08', 2, 'backward')).toEqual({
      text: '08',
      caret: 2,
    });
  });

  it('AF6-02 xóa một chữ số thật thì giữ nguyên hành vi thường', () => {
    expect(applyTimeChange('08:30', '08:3', 4, 'backward')).toEqual({
      text: '08:3',
      caret: 4,
    });
  });
});
