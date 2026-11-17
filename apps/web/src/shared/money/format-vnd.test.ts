import { describe, expect, it } from 'vitest';
import {
  absoluteAmount,
  formatSignedVnd,
  formatVnd,
  formatVndDigits,
  isDecimalAmount,
  isNegativeAmount,
} from './format-vnd';

// payment F1: `formatVnd` dùng chung. Ca WVI-04 ★: tiền là chuỗi decimal, không đi qua `Number` (đột biến: đổi sang `Number(...)` thì ca số lớn đỏ).
describe('shared formatVnd (payment F1)', () => {
  it('WVI-04 định dạng chuỗi decimal của API, chấm ngăn nghìn, bỏ phần lẻ ".00"', () => {
    expect(formatVnd('350000.00')).toBe('350.000đ');
    expect(formatVnd('0.00')).toBe('0đ');
    expect(formatVnd('2000000')).toBe('2.000.000đ');
    expect(formatVnd('999.00')).toBe('999đ');
    expect(formatVndDigits('350000.00')).toBe('350.000');
  });

  it('WVI-04 ★ số lớn hơn 2^53 vẫn đúng từng chữ số (qua `Number` sẽ bị làm tròn)', () => {
    expect(formatVnd('9007199254740993.00')).toBe('9.007.199.254.740.993đ');
  });

  it('WVI-04 phần lẻ khác 0 vẫn hiện (hoàn tiền làm tròn tới 0,01), bỏ số 0 thừa cuối', () => {
    expect(formatVnd('50000.50')).toBe('50.000,5đ');
    expect(formatVnd('0.10')).toBe('0,1đ');
    expect(formatVnd('12.05')).toBe('12,05đ');
  });

  it('WVI-04 số âm dùng dấu trừ U+2212 như Figma; "+" chỉ ở dạng có dấu, số 0 không dấu', () => {
    expect(formatVnd('-100000.00')).toBe('−100.000đ');
    expect(formatSignedVnd('-100000.00')).toBe('−100.000đ');
    expect(formatSignedVnd('500000.00')).toBe('+500.000đ');
    expect(formatSignedVnd('0.00')).toBe('0đ');
    expect(formatSignedVnd('-0.00')).toBe('0đ');
    expect(isNegativeAmount('-0.00')).toBe(false);
    expect(isNegativeAmount('-1.00')).toBe(true);
    expect(absoluteAmount('-100000.00')).toBe('100000.00');
    expect(absoluteAmount('100000.00')).toBe('100000.00');
  });

  it('WVI-04 ca âm: chuỗi sai dạng ném RangeError, không in ra "NaNđ"', () => {
    for (const bad of ['', 'abc', '1e5', ' 100', '+100', '1.000,00', '--1']) {
      expect(isDecimalAmount(bad)).toBe(false);
      expect(() => formatVnd(bad)).toThrow(RangeError);
    }
  });
});
