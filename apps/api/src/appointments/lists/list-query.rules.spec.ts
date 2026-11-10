import {
  dayBounds,
  intersectStates,
  isBigintId,
  isNotBefore,
  isVisitProfileFilter,
  LAST_DAY,
  toStringArray,
} from './list-query.rules.js';

// Task B1 — phần thuần dùng chung của các danh sách lịch hẹn (PLAN booking 7.4; TRACKING 3.13.4). Mã LSH-15…LSH-20 là [đề xuất].

describe('toStringArray (LSH-15)', () => {
  it('LSH-15 lặp khoá giữ nguyên thứ tự; một giá trị thành mảng một phần tử; dấu phẩy được tách; bỏ trùng', () => {
    expect(toStringArray(['DaHuy', 'VangMat'])).toStrictEqual([
      'DaHuy',
      'VangMat',
    ]);
    expect(toStringArray('DaHuy')).toStrictEqual(['DaHuy']);
    expect(toStringArray('DaHuy,VangMat')).toStrictEqual(['DaHuy', 'VangMat']);
    expect(toStringArray(['DaHuy,VangMat', 'DaHuy'])).toStrictEqual([
      'DaHuy',
      'VangMat',
    ]);
    expect(toStringArray('DaHuy,DaHuy,DaHuy')).toStrictEqual(['DaHuy']);
  });

  it('LSH-15 ca biên: chuỗi rỗng và dấu phẩy thừa cho phần tử rỗng (để @IsIn báo lỗi); không cắt khoảng trắng', () => {
    expect(toStringArray('')).toStrictEqual(['']);
    expect(toStringArray('DaHuy,')).toStrictEqual(['DaHuy', '']);
    expect(toStringArray(' DaHuy')).toStrictEqual([' DaHuy']);
  });

  it('LSH-15 ca âm: giá trị không phải chuỗi hay mảng chuỗi giữ nguyên để bước kiểm báo lỗi', () => {
    const object = { 0: 'DaHuy' };
    expect(toStringArray(undefined)).toBeUndefined();
    expect(toStringArray(7)).toBe(7);
    expect(toStringArray(object)).toBe(object);
    const mixed = ['DaHuy', 3];
    expect(toStringArray(mixed)).toBe(mixed);
  });
});

describe('isBigintId, isVisitProfileFilter (LSH-16)', () => {
  it.each(['1', '9', '10', '123456789012345678', '9223372036854775807'])(
    'LSH-16 id hợp lệ %s',
    (value) => {
      expect(isBigintId(value)).toBe(true);
    },
  );

  it.each([
    ['rỗng', ''],
    ['số 0', '0'],
    ['số 0 đứng đầu', '01'],
    ['số âm', '-1'],
    ['chữ', 'abc'],
    ['thập phân', '1.5'],
    ['khoảng trắng', ' 1'],
    ['20 chữ số', '12345678901234567890'],
    ['vượt BIGINT 1 đơn vị', '9223372036854775808'],
    ['số (không phải chuỗi)', 5],
    ['mảng', ['1']],
    ['null', null],
    ['undefined', undefined],
  ])('LSH-16 id sai: %s', (_name, value) => {
    expect(isBigintId(value)).toBe(false);
  });

  it('LSH-16 bộ lọc hồ sơ đi khám: BanThan đúng chữ hoặc id; banthan, BANTHAN, Ban Than đều sai', () => {
    expect(isVisitProfileFilter('BanThan')).toBe(true);
    expect(isVisitProfileFilter('12')).toBe(true);
    for (const wrong of ['banthan', 'BANTHAN', 'Ban Than', 'BanThan ', '0', ''])
      expect(isVisitProfileFilter(wrong), wrong).toBe(false);
  });
});

describe('intersectStates (LSH-17)', () => {
  it('LSH-17 giao theo thứ tự của tập đầu; tập undefined là không giới hạn', () => {
    const all = ['a', 'b', 'c', 'd'];
    expect(intersectStates(all)).toStrictEqual(all);
    expect(intersectStates(all, ['d', 'b'])).toStrictEqual(['b', 'd']);
    expect(intersectStates(all, undefined, ['c', 'x'])).toStrictEqual(['c']);
  });

  it('LSH-17 ca biên: giao rỗng; tập rỗng chặn hết; không sửa đầu vào', () => {
    const all = ['a', 'b'] as const;
    expect(intersectStates(all, ['c'])).toStrictEqual([]);
    expect(intersectStates(all, [])).toStrictEqual([]);
    expect(all).toStrictEqual(['a', 'b']);
  });
});

describe('dayBounds, isNotBefore (LSH-20, LSH-12)', () => {
  it('LSH-20 một ngày: từ 00:00:00 của chính ngày đó đến (không gồm) 00:00:00 của ngày kế', () => {
    expect(dayBounds('2026-11-10', '2026-11-10')).toStrictEqual({
      from: '2026-11-10 00:00:00',
      to: '2026-11-11 00:00:00',
    });
  });

  it.each([
    ['cuối tháng', '2026-11-30', '2026-12-01 00:00:00'],
    ['cuối năm', '2026-12-31', '2027-01-01 00:00:00'],
    ['ngày nhuận', '2028-02-28', '2028-02-29 00:00:00'],
    ['sau ngày nhuận', '2028-02-29', '2028-03-01 00:00:00'],
    ['năm thường', '2026-02-28', '2026-03-01 00:00:00'],
    ['đầu thế kỷ (không nhuận)', '1900-02-28', '1900-03-01 00:00:00'],
    ['năm 0001', '0001-01-01', '0001-01-02 00:00:00'],
  ])('LSH-20 cận trên %s', (_name, denNgay, expected) => {
    expect(dayBounds(undefined, denNgay).to).toBe(expected);
  });

  it('LSH-20 ngày cuối của DATETIME bỏ cận trên (ngày kế tràn sang năm 10000); ngày liền trước thì vẫn có', () => {
    expect(dayBounds(undefined, LAST_DAY)).toStrictEqual({
      from: null,
      to: null,
    });
    expect(dayBounds(undefined, '9999-12-30').to).toBe('9999-12-31 00:00:00');
  });

  it('LSH-20 thiếu một đầu thì mở ở đầu đó; thiếu cả hai thì không chặn', () => {
    expect(dayBounds('2026-11-10', undefined)).toStrictEqual({
      from: '2026-11-10 00:00:00',
      to: null,
    });
    expect(dayBounds(undefined, undefined)).toStrictEqual({
      from: null,
      to: null,
    });
  });

  it('LSH-20 ca âm: ngày không có thật là lỗi lập trình (DTO đã chặn), không âm thầm đổi thành ngày khác', () => {
    for (const bad of ['2026-02-29', '2026-13-45', '10/11/2026', ''])
      expect(() => dayBounds(bad, undefined), bad).toThrow(RangeError);
    expect(() => dayBounds(undefined, '2026-02-29')).toThrow(RangeError);
    expect(() => isNotBefore('2026-11-10', '2026-02-30')).toThrow(RangeError);
  });

  it('LSH-12 isNotBefore: cùng ngày và ngày sau là đạt; ngày trước thì không; so theo ngày, không theo chuỗi giờ', () => {
    expect(isNotBefore('2026-11-10', '2026-11-10')).toBe(true);
    expect(isNotBefore('2026-11-10', '2026-11-11')).toBe(true);
    expect(isNotBefore('2026-11-10', '2026-11-09')).toBe(false);
    expect(isNotBefore('2026-12-31', '2027-01-01')).toBe(true);
    expect(isNotBefore('2027-01-01', '2026-12-31')).toBe(false);
  });
});
