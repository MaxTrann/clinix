import { REFUND_MAX_ATTEMPTS } from '../wallet.constants.js';
import {
  buildNeedsAttentionText,
  buildRefundedText,
  decideRefund,
  failedAutoAttempts,
  nextAttemptNumber,
  totalRefunded,
  type RefundAttemptRow,
} from './refund.rules.js';

// payment B8: luật thuần của hoàn cọc tự động. Mã test case theo PLAN payment 7.x (HCC). Dữ liệu giả.
const row = (patch: Partial<RefundAttemptRow>): RefundAttemptRow => ({
  loai: 'TuDong',
  trangThai: 'ThatBai',
  soTien: '50000.00',
  soLanThu: 1,
  ...patch,
});
const PAID = '100000.00';

describe('refund.rules (payment B8)', () => {
  it('HCC-01 chưa có dòng nào: cộng đúng số booking truyền, lần thử số 1', () => {
    expect(
      decideRefund({ rows: [], daThanhToan: PAID, soTien: '50000.00' }),
    ).toEqual({
      kind: 'Credit',
      soTien: '50000.00',
      soLanThu: 1,
    });
  });

  it('HCC-03 ★ đã có dòng TuDong ThanhCong ⇒ AlreadyRefunded (không cộng lần hai), kể cả khi trước đó từng thất bại nhiều lần', () => {
    const rows = [
      row({ soLanThu: 1 }),
      row({ soLanThu: 2 }),
      row({ soLanThu: 3 }),
      row({ soLanThu: 4, trangThai: 'ThanhCong' }),
    ];
    // Thất bại 3 lần + thành công ở lần 4: KHÔNG được báo hết lượt
    expect(
      decideRefund({ rows, daThanhToan: PAID, soTien: '50000.00' }),
    ).toEqual({
      kind: 'AlreadyRefunded',
    });
  });

  it('HCC-06 đủ REFUND_MAX_ATTEMPTS lần thất bại tự động ⇒ AttemptsExhausted; thiếu một lần vẫn thử tiếp (biên)', () => {
    const failed = (count: number) =>
      Array.from({ length: count }, (_, i) => row({ soLanThu: i + 1 }));
    expect(REFUND_MAX_ATTEMPTS).toBe(4);
    expect(
      decideRefund({ rows: failed(4), daThanhToan: PAID, soTien: '50000.00' }),
    ).toEqual({ kind: 'AttemptsExhausted' });
    expect(
      decideRefund({ rows: failed(3), daThanhToan: PAID, soTien: '50000.00' }),
    ).toEqual({ kind: 'Credit', soTien: '50000.00', soLanThu: 4 });
  });

  it('HCC-12 đã hoàn đặc biệt trước ⇒ số hoàn bị cắt theo trần (đã thanh toán − tổng đã hoàn); hết chỗ ⇒ NothingLeft', () => {
    const special = row({
      loai: 'DacBiet',
      trangThai: 'ThanhCong',
      soTien: '70000.00',
      soLanThu: 1,
    });
    expect(
      decideRefund({ rows: [special], daThanhToan: PAID, soTien: '50000.00' }),
    ).toEqual({ kind: 'Credit', soTien: '30000.00', soLanThu: 2 });
    const all = row({
      loai: 'DacBiet',
      trangThai: 'ThanhCong',
      soTien: '100000.00',
    });
    expect(
      decideRefund({ rows: [all], daThanhToan: PAID, soTien: '50000.00' }),
    ).toEqual({ kind: 'NothingLeft' });
  });

  it('dòng ThatBai và dòng hoàn đặc biệt lỗi (không có dòng) không làm giảm trần; chỉ ThanhCong được tính', () => {
    const rows = [row({ soTien: '99999.00', soLanThu: 1 })];
    expect(totalRefunded(rows)).toBe('0.00');
    expect(
      decideRefund({ rows, daThanhToan: PAID, soTien: '100000.00' }),
    ).toEqual({
      kind: 'Credit',
      soTien: '100000.00',
      soLanThu: 2,
    });
  });

  it('số lần thử kế tiếp đếm CHUNG mọi dòng (UNIQUE theo khoản); đếm thất bại chỉ tính dòng tự động', () => {
    const rows = [
      row({ loai: 'DacBiet', trangThai: 'ThanhCong', soLanThu: 1 }),
      row({ soLanThu: 2 }),
    ];
    expect(nextAttemptNumber(rows)).toBe(3);
    expect(nextAttemptNumber([])).toBe(1);
    expect(failedAutoAttempts(rows)).toBe(1);
  });

  it('HCC-07 biên tiền: cộng đúng bằng trần là hợp lệ; số booking truyền lớn hơn trần bị cắt tới trần; số lẻ 0,01 giữ nguyên', () => {
    expect(
      decideRefund({ rows: [], daThanhToan: PAID, soTien: '100000.00' }),
    ).toMatchObject({ kind: 'Credit', soTien: '100000.00' });
    expect(
      decideRefund({ rows: [], daThanhToan: PAID, soTien: '100000.01' }),
    ).toMatchObject({ kind: 'Credit', soTien: '100000.00' });
    expect(
      decideRefund({ rows: [], daThanhToan: PAID, soTien: '0.01' }),
    ).toMatchObject({ kind: 'Credit', soTien: '0.01' });
  });

  it('TDT-04 nội dung thông báo: một dòng, có mã lịch và số tiền, không số dư, không xuống dòng, không vượt 500 ký tự dù mã lịch cố tình dài hay chứa xuống dòng', () => {
    const text = buildRefundedText('CLX-20261110-ABCDE', '50000.00');
    expect(text).toBe(
      'Đã hoàn 50.000đ tiền cọc của lịch hẹn CLX-20261110-ABCDE vào ví của bạn.',
    );
    const hostile = buildRefundedText(`X\n${'A'.repeat(600)}`, '1234.50');
    expect(hostile).not.toMatch(/[\r\n]/);
    expect(hostile.length).toBeLessThanOrEqual(500);
    expect(buildNeedsAttentionText('CLX-1')).toContain('hoàn tiền đặc biệt');
    expect(buildNeedsAttentionText(`A\nB${'C'.repeat(600)}`)).not.toMatch(
      /[\r\n]/,
    );
  });
});
