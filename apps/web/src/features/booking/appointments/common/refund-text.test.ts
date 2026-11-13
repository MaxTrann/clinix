import { describe, expect, it } from 'vitest';
import { isZeroAmount, refundLine, refundResultLine } from './refund-text';

// booking F2 viết, F9 chuyển cùng hàm lên `common/`: hiển thị số hoàn sau khi huỷ (Q16, Q18, H4). Giữ NGUYÊN mã HHL-02, HHL-04 (PLAN booking mục 7.33). Hàm thuần: chỉ
// định dạng và so sánh CHUỖI, không tính tiền.
describe('isZeroAmount', () => {
  it('HHL-02 nhận ra số 0 ở mọi dạng, không nhận nhầm số khác 0', () => {
    for (const zero of ['0', '0.00', '000', '0.0', '00.000']) {
      expect(isZeroAmount(zero)).toBe(true);
    }
    for (const other of [
      '0.01',
      '10.00',
      '100000.00',
      '0.10',
      '9007199254740993.00',
    ]) {
      expect(isZeroAmount(other)).toBe(false);
    }
  });
});

describe('refundLine', () => {
  it('HHL-02 100%, 50% ⇒ "số tiền (phần trăm)"; chuỗi lớn hơn 2^53 giữ đủ chữ số', () => {
    expect(refundLine({ tyLe: 100, soTien: '100000.00' })).toBe(
      '100.000đ (100%)',
    );
    expect(refundLine({ tyLe: 50, soTien: '50000.00' })).toBe('50.000đ (50%)');
    expect(refundLine({ tyLe: 100, soTien: '9007199254740993.00' })).toBe(
      '9.007.199.254.740.993đ (100%)',
    );
  });

  it('HHL-02 null hay số tiền 0 (kể cả tyLe lớn hơn 0) ⇒ null: "không hoàn"', () => {
    expect(refundLine(null)).toBeNull();
    expect(refundLine({ tyLe: 0, soTien: '0.00' })).toBeNull();
    expect(refundLine({ tyLe: 50, soTien: '0.00' })).toBeNull();
  });

  it('HHL-02 soTien của máy chủ hiện nguyên chuỗi, KHÔNG được client tính lại từ tyLe', () => {
    // 33% của 100.000đ là 33.000đ; máy chủ trả 12.345đ thì phải hiện đúng 12.345đ
    expect(refundLine({ tyLe: 33, soTien: '12345.00' })).toBe('12.345đ (33%)');
  });
});

describe('refundResultLine', () => {
  it('HHL-04 có hoàn ⇒ "Số tiền hoàn: …"; không hoàn ⇒ "Không có khoản hoàn."', () => {
    expect(refundResultLine({ tyLe: 50, soTien: '50000.00' })).toBe(
      'Số tiền hoàn: 50.000đ (50%)',
    );
    expect(refundResultLine(null)).toBe('Không có khoản hoàn.');
    expect(refundResultLine({ tyLe: 0, soTien: '0.00' })).toBe(
      'Không có khoản hoàn.',
    );
  });
});
