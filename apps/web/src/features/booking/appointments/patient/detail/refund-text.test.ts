import { describe, expect, it } from 'vitest';
import { cutoffLine, sameRefund } from './refund-text';

// booking F2: phần hiển thị số hoàn chỉ của hộp huỷ CÓ XEM TRƯỚC (Q16, Q18, H4). Mã HHL là [đề xuất] (PLAN booking mục 7.33). `isZeroAmount`, `refundLine`, `refundResultLine`
// chuyển lên `common/refund-text.ts` ở F9, test của chúng đi theo (`common/refund-text.test.ts`, giữ nguyên mã HHL-02, HHL-04). Hàm thuần: chỉ định dạng và so sánh CHUỖI.
describe('cutoffLine', () => {
  it('HHL-02 chỉ khi có khoản hoàn VÀ mocApDung khác null', () => {
    expect(cutoffLine({ tyLe: 100, soTien: '1000.00', mocApDung: 24 })).toBe(
      'Áp dụng khi hủy trước giờ khám từ 24 giờ',
    );
    expect(cutoffLine({ tyLe: 50, soTien: '500.00', mocApDung: 0 })).toBe(
      'Áp dụng khi hủy trước giờ khám từ 0 giờ',
    );
  });

  it('HHL-02 mocApDung null, tyLe 0 hay hoanCoc null ⇒ không có dòng mốc', () => {
    expect(
      cutoffLine({ tyLe: 100, soTien: '1000.00', mocApDung: null }),
    ).toBeNull();
    expect(cutoffLine({ tyLe: 0, soTien: '0.00', mocApDung: 2 })).toBeNull();
    expect(cutoffLine(null)).toBeNull();
  });
});

describe('sameRefund', () => {
  it('HHL-05 "không hoàn" (null hay 0) bằng nhau dù tyLe khác nhau; số khác nhau ở tyLe hay tiền thì khác', () => {
    expect(sameRefund(null, null)).toBe(true);
    expect(sameRefund(null, { tyLe: 0, soTien: '0.00' })).toBe(true);
    expect(
      sameRefund({ tyLe: 0, soTien: '0.00' }, { tyLe: 50, soTien: '0.00' }),
    ).toBe(true);
    expect(
      sameRefund(
        { tyLe: 50, soTien: '50000.00' },
        { tyLe: 50, soTien: '50000.00' },
      ),
    ).toBe(true);

    expect(
      sameRefund(
        { tyLe: 100, soTien: '100000.00' },
        { tyLe: 50, soTien: '50000.00' },
      ),
    ).toBe(false);
    expect(sameRefund({ tyLe: 50, soTien: '50000.00' }, null)).toBe(false);
    expect(sameRefund(null, { tyLe: 50, soTien: '50000.00' })).toBe(false);
    // Cùng tyLe, tiền khác (cọc đã thu đổi giữa hai lần): vẫn là khác
    expect(
      sameRefund(
        { tyLe: 50, soTien: '50000.00' },
        { tyLe: 50, soTien: '50000.01' },
      ),
    ).toBe(false);
  });
});
