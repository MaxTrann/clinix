import { caretAfterDigits } from '../digit-caret';
import {
  applyTextChange,
  formatThousands,
  insertText,
  MAX_PRICE_DIGITS,
  parseApiPrice,
  pasteDigits,
} from './price-format';

// AF3-13 (admin PR2 mục 6.3): ô giá chỉ nhận số nguyên đồng, ngăn nghìn bằng dấu chấm, tối đa 10 chữ số (API `^\d{1,10}`).
// Phần thuần của ô giá: định dạng, dán, gõ, xóa dấu phân cách, con trỏ.

describe('formatThousands', () => {
  it.each([
    ['', ''],
    ['0', '0'],
    ['7', '7'],
    ['999', '999'],
    ['1000', '1.000'],
    ['150000', '150.000'],
    ['3000000', '3.000.000'],
    ['9999999999', '9.999.999.999'],
  ])('AF3-13 %s ⇒ %s', (digits, expected) => {
    expect(formatThousands(digits)).toBe(expected);
  });

  it('AF3-13 biên: giới hạn là đúng 10 chữ số', () => {
    expect(MAX_PRICE_DIGITS).toBe(10);
  });
});

describe('pasteDigits', () => {
  it.each([
    ['3,000,000', '3000000'],
    ['3.000.000đ', '3000000'],
    ['300 000', '300000'],
    ['  150000  ', '150000'],
    ['1.234.567', '1234567'],
    ['3.000', '3000'],
    ['abc', ''],
  ])('AF3-13 dán %j ⇒ %j', (text, expected) => {
    expect(pasteDigits(text)).toBe(expected);
  });

  it.each([
    ['300.000,50', '300000'],
    ['150000.50', '150000'],
    ['150000.00', '150000'],
    ['1.5', '1'],
    ['12.5đ', '12'],
    ['1,234.5', '1234'],
    ['0,5', '0'],
  ])(
    'AF3-13 đuôi lẻ %j ⇒ %j (không bao giờ thành số gấp 100 lần)',
    (text, expected) => {
      expect(pasteDigits(text)).toBe(expected);
    },
  );
});

describe('applyTextChange (gõ vào ô)', () => {
  it('AF3-13 gõ chữ số đầu tiên', () => {
    expect(applyTextChange('', '1', 1, 'backward')).toEqual({
      digits: '1',
      caretDigits: 1,
    });
  });

  it('AF3-13 gõ ở cuối', () => {
    expect(applyTextChange('3.000', '3.0001', 6, 'backward')).toEqual({
      digits: '30001',
      caretDigits: 5,
    });
  });

  it('AF3-13 gõ giữa chuỗi: số chữ số trước con trỏ được giữ', () => {
    expect(applyTextChange('1.000', '1.2000', 3, 'backward')).toEqual({
      digits: '12000',
      caretDigits: 2,
    });
  });

  it('AF3-13 ký tự không phải số bị bỏ, con trỏ ở lại chỗ cũ', () => {
    expect(applyTextChange('150', '150a', 4, 'backward')).toEqual({
      digits: '150',
      caretDigits: 3,
    });
  });

  it('AF3-13 gõ dấu chấm (giá trị dài ra, cùng chữ số) không xóa chữ số nào', () => {
    expect(applyTextChange('150', '150.', 4, 'backward')).toEqual({
      digits: '150',
      caretDigits: 3,
    });
  });

  it('AF3-13 bỏ số 0 đứng đầu và dịch con trỏ theo', () => {
    expect(applyTextChange('5', '05', 1, 'backward')).toEqual({
      digits: '5',
      caretDigits: 0,
    });
    expect(applyTextChange('0', '00', 2, 'backward')).toEqual({
      digits: '0',
      caretDigits: 1,
    });
  });

  it('AF3-13 biên: chữ số thứ 11 bị bỏ qua, giá trị cũ giữ nguyên', () => {
    expect(
      applyTextChange('9.999.999.999', '99.999.999.999', 2, 'backward'),
    ).toEqual({ digits: '9999999999', caretDigits: 1 });
  });

  it('AF3-13 biên: đúng 10 chữ số vẫn được nhận', () => {
    expect(
      applyTextChange('123.456.789', '1.234.567.890', 13, 'backward'),
    ).toEqual({ digits: '1234567890', caretDigits: 10 });
  });

  it('AF3-13 xóa hết', () => {
    expect(applyTextChange('1', '', 0, 'backward')).toEqual({
      digits: '',
      caretDigits: 0,
    });
  });
});

describe('applyTextChange (xóa dấu phân cách, điều kiện A của phiên kiểm)', () => {
  it('AF3-13 Backspace ngay sau dấu chấm: chỉ mất dấu chấm thì xóa chữ số đứng trước nó', () => {
    // "13.|000" bấm Backspace: trình duyệt chỉ bỏ dấu chấm ⇒ "13|000"
    expect(applyTextChange('13.000', '13000', 2, 'backward')).toEqual({
      digits: '1000',
      caretDigits: 1,
    });
  });

  it('AF3-13 Delete ngay trước dấu chấm: xóa chữ số đứng sau nó', () => {
    // "13|.000" bấm Delete ⇒ "13|000"
    expect(applyTextChange('13.000', '13000', 2, 'forward')).toEqual({
      digits: '1300',
      caretDigits: 2,
    });
  });

  it('AF3-13 xóa một chữ số thật (không phải dấu chấm) thì giữ nguyên hành vi thường', () => {
    expect(applyTextChange('1.000', '1.00', 4, 'backward')).toEqual({
      digits: '100',
      caretDigits: 3,
    });
  });

  it('AF3-13 xóa dấu chấm ở đầu chuỗi không có chữ số trước con trỏ thì không làm gì thêm', () => {
    expect(applyTextChange('1.000', '1000', 0, 'backward')).toEqual({
      digits: '1000',
      caretDigits: 0,
    });
  });
});

describe('insertText (dán và thả chữ)', () => {
  it('AF3-13 dán vào ô rỗng: bỏ mọi ký tự không phải số', () => {
    expect(insertText('', 0, 0, '3,000,000')).toEqual({
      digits: '3000000',
      caretDigits: 7,
    });
  });

  it('AF3-13 dán đè vùng chọn', () => {
    expect(insertText('150.000', 0, 7, '300 000')).toEqual({
      digits: '300000',
      caretDigits: 6,
    });
  });

  it('AF3-13 dán giữa chuỗi', () => {
    expect(insertText('1.000', 1, 1, '23')).toEqual({
      digits: '123000',
      caretDigits: 3,
    });
  });

  it('AF3-13 dán có đuôi lẻ thì bỏ đuôi', () => {
    expect(insertText('', 0, 0, '300.000,50')).toEqual({
      digits: '300000',
      caretDigits: 6,
    });
  });

  it('AF3-13 biên: đúng 10 chữ số nhận, 11 chữ số bỏ lần dán', () => {
    expect(insertText('', 0, 0, '1234567890')).toEqual({
      digits: '1234567890',
      caretDigits: 10,
    });
    expect(insertText('', 0, 0, '12345678901')).toBeNull();
    expect(insertText('1234567890', 10, 10, '1')).toBeNull();
  });

  it('AF3-13 số 0 đứng đầu bị bỏ sau khi dán', () => {
    expect(insertText('', 0, 0, '0005')).toEqual({
      digits: '5',
      caretDigits: 1,
    });
  });

  it('AF3-13 chữ không có chữ số nào thì không đổi gì', () => {
    expect(insertText('15', 2, 2, 'abc')).toEqual({
      digits: '15',
      caretDigits: 2,
    });
  });
});

describe('caretAfterDigits (dùng chung với ô giờ)', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 3],
    [7, 9],
    [99, 9],
  ])(
    'AF3-13 sau %i chữ số ⇒ vị trí %i trong "3.000.000"',
    (digits, position) => {
      expect(caretAfterDigits('3.000.000', digits)).toBe(position);
    },
  );

  it('AF3-13 chuỗi rỗng và số chữ số âm', () => {
    expect(caretAfterDigits('', 0)).toBe(0);
    expect(caretAfterDigits('3.000', -1)).toBe(0);
  });
});

describe('parseApiPrice (nạp giá của API vào form sửa)', () => {
  it('AF3-14 giá chẵn "150000.00" ⇒ 150000, không có phần lẻ', () => {
    expect(parseApiPrice('150000.00')).toEqual({
      digits: '150000',
      fraction: '00',
      hasFraction: false,
    });
  });

  it('AF3-14 giá có phần lẻ "350000.50" ⇒ giữ phần nguyên, nhớ phần lẻ', () => {
    expect(parseApiPrice('350000.50')).toEqual({
      digits: '350000',
      fraction: '50',
      hasFraction: true,
    });
  });

  it('AF3-14 giá không có dấu chấm', () => {
    expect(parseApiPrice('300000')).toEqual({
      digits: '300000',
      fraction: '',
      hasFraction: false,
    });
  });

  it('AF3-14 biên: "0.00", số 0 đứng đầu và chuỗi rỗng', () => {
    expect(parseApiPrice('0.00').digits).toBe('0');
    expect(parseApiPrice('0012.00').digits).toBe('12');
    expect(parseApiPrice('').digits).toBe('');
  });

  it('AF3-14 phần lẻ ".05" cũng là phần lẻ', () => {
    expect(parseApiPrice('100.05').hasFraction).toBe(true);
  });
});
