import { describe, expect, it } from 'vitest';
import {
  compareDigits,
  digitsOf,
  wholeDong,
  withdrawProblem,
} from './withdraw-form';

// payment F6: luật thuần của tab Rút tiền (WRT-01 phần kiểm trước khi gửi). Không DOM, không mạng.
describe('withdraw-form (payment F6)', () => {
  it('WRT-01 digitsOf: bỏ dấu chấm, chữ, số 0 đầu; tối đa 10 chữ số', () => {
    expect(digitsOf('100.000')).toBe('100000');
    expect(digitsOf('abc1x2')).toBe('12');
    expect(digitsOf('000500')).toBe('500');
    expect(digitsOf('0')).toBe('0');
    expect(digitsOf('')).toBe('');
    expect(digitsOf('123456789012')).toBe('1234567890');
  });

  it('WRT-01 wholeDong và compareDigits: so trên chuỗi, đúng cả số vượt Number.MAX_SAFE_INTEGER', () => {
    expect(wholeDong('350000.00')).toBe('350000');
    expect(compareDigits('99', '100')).toBeLessThan(0);
    expect(compareDigits('350000', '350000')).toBe(0);
    expect(
      compareDigits('9007199254740993', '9007199254740992'),
    ).toBeGreaterThan(0);
  });

  it('WRT-01 withdrawProblem: trống, toàn số 0 ⇒ required; vượt khả dụng ⇒ overAvailable; đúng bằng khả dụng (biên) hợp lệ', () => {
    expect(withdrawProblem('', '350000.00')).toBe('required');
    expect(withdrawProblem('0', '350000.00')).toBe('required');
    expect(withdrawProblem('350001', '350000.00')).toBe('overAvailable');
    expect(withdrawProblem('1000000', '350000.00')).toBe('overAvailable');
    expect(withdrawProblem('350000', '350000.00')).toBeNull();
    expect(withdrawProblem('1', '350000.00')).toBeNull();
    // Khả dụng 0: mọi số dương đều vượt
    expect(withdrawProblem('10000', '0.00')).toBe('overAvailable');
  });
});
