import type { RefundAttemptRow } from '../refund/refund.rules.js';
import {
  buildSpecialRefundText,
  decideSpecialRefund,
  hasSpecialRefund,
  refundableOf,
} from './special-refund.rules.js';

// payment B13 — luật thuần của hoàn tiền đặc biệt (HDB-05, HDB-06, HDB-07 phần luật; nhánh nào cũng có ca). Không DB.
const row = (patch: Partial<RefundAttemptRow>): RefundAttemptRow => ({
  loai: 'TuDong',
  trangThai: 'ThanhCong',
  soTien: '50000.00',
  soLanThu: 1,
  ...patch,
});

describe('special-refund.rules (payment B13)', () => {
  it('HDB-07 refundableOf: trừ mọi dòng THÀNH CÔNG (tự động và đặc biệt), bỏ dòng thất bại; không âm', () => {
    expect(refundableOf('100000.00', [])).toEqual({
      daHoan: '0.00',
      conCoTheHoan: '100000.00',
    });
    expect(
      refundableOf('100000.00', [
        row({}),
        row({ trangThai: 'ThatBai', soLanThu: 2 }),
        row({ loai: 'DacBiet', soTien: '20000.00', soLanThu: 3 }),
      ]),
    ).toEqual({ daHoan: '70000.00', conCoTheHoan: '30000.00' });
    // Dữ liệu hỏng (đã hoàn quá) không ra số âm
    expect(
      refundableOf('100000.00', [row({ soTien: '150000.00' })]).conCoTheHoan,
    ).toBe('0.00');
  });

  it('HDB-06 hasSpecialRefund: chỉ dòng DacBiet ThanhCong', () => {
    expect(hasSpecialRefund([row({})])).toBe(false);
    expect(
      hasSpecialRefund([row({ loai: 'DacBiet', trangThai: 'ThatBai' })]),
    ).toBe(false);
    expect(hasSpecialRefund([row({ loai: 'DacBiet' })])).toBe(true);
  });

  it('HDB-05, HDB-06 decideSpecialRefund: đã hoàn đặc biệt kiểm TRƯỚC trần; vượt ⇒ Exceeds kèm số còn lại; đúng bằng số còn lại (biên) ⇒ Credit', () => {
    const daThanhToan = '100000.00';
    expect(
      decideSpecialRefund({
        rows: [row({ loai: 'DacBiet', soTien: '1.00' })],
        daThanhToan,
        soTien: '1.00',
      }),
    ).toEqual({
      kind: 'AlreadySpecial',
    });
    expect(
      decideSpecialRefund({ rows: [row({})], daThanhToan, soTien: '50000.01' }),
    ).toEqual({
      kind: 'Exceeds',
      conCoTheHoan: '50000.00',
    });
    expect(
      decideSpecialRefund({ rows: [row({})], daThanhToan, soTien: '50000.00' }),
    ).toEqual({ kind: 'Credit' });
    expect(
      decideSpecialRefund({
        rows: [row({ soTien: '100000.00' })],
        daThanhToan,
        soTien: '1.00',
      }),
    ).toMatchObject({
      kind: 'Exceeds',
      conCoTheHoan: '0.00',
    });
  });

  it('câu thông báo: số tiền định dạng, mã lịch, một dòng ≤ 500 ký tự; xuống dòng trong mã bị gộp', () => {
    const text = buildSpecialRefundText('CLX-1\nX', '40000.00');
    expect(text).toContain('40.000đ');
    expect(text).not.toContain('\n');
    expect(text.length).toBeLessThanOrEqual(500);
  });
});
