import { describe, expect, it } from 'vitest';
import { paymentViewOf } from './payment-view';

// booking F6: trang Thanh toán vẽ gì cho một lịch hẹn (CHỈ MỘT chỗ quyết định theo `trangThai` và hết hạn, như `done-state.ts` của F7). WPF6-07 là [đề xuất] (TRACKING booking 3.49.3).
describe('WPF6-07 paymentViewOf', () => {
  it('ChoThanhToan còn hạn ⇒ pay (đồng hồ và panel); hết hạn ⇒ expired', () => {
    expect(paymentViewOf('ChoThanhToan', false)).toBe('pay');
    expect(paymentViewOf('ChoThanhToan', true)).toBe('expired');
  });

  it('DaHuy ⇒ cancelled, dù hết hạn hay không', () => {
    expect(paymentViewOf('DaHuy', false)).toBe('cancelled');
    expect(paymentViewOf('DaHuy', true)).toBe('cancelled');
  });

  it.each(['DaXacNhan', 'VangMat', 'HoanThanh', 'DaTiepDon'])(
    '%s ⇒ done (chuyển Bước 6, nơi có câu đúng trạng thái)',
    (status) => {
      expect(paymentViewOf(status, false)).toBe('done');
      expect(paymentViewOf(status, true)).toBe('done');
    },
  );

  it('mã trạng thái lạ (kể cả DaDoiLich nếu backend lỡ trả) ⇒ done, KHÔNG bao giờ pay', () => {
    expect(paymentViewOf('DaDoiLich', false)).toBe('done');
    expect(paymentViewOf('', false)).toBe('done');
    expect(paymentViewOf('chothanhtoan', false)).toBe('done');
  });
});
