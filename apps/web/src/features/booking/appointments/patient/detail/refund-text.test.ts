import { describe, expect, it } from 'vitest';
import {
  cutoffLine,
  isZeroAmount,
  refundLine,
  refundResultLine,
  sameRefund,
} from './refund-text';

// booking F2: hiển thị số hoàn của hộp huỷ (Q16, Q18, H4). Mã HHL là [đề xuất] (PLAN booking mục 7.33 sau khi duyệt). Hàm thuần: chỉ định dạng và so sánh CHUỖI.
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
