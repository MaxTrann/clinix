import { describe, expect, it } from 'vitest';
import { LIST_TEXT } from './list-messages';
import { paymentSummary } from './payment-summary';

// booking F12, UI-09 (Đại duyệt 14/11/2026, phương án 1). Mã UIF là [đề xuất] (PLAN booking mục 7.48). `paymentSummary` là SUY LUẬN từ trạng thái và cọc, không phải bản ghi thanh toán:
// không bao giờ có "Đã thanh toán đủ" (cần `payment`, TECH_DEBT 146).
describe('paymentSummary (cột Thanh toán của Admin, suy từ trạng thái và cọc)', () => {
  it.each([
    // [trạng thái, cọc, kết quả]
    ['ChoThanhToan', '100000.00', 'ChuaThanhToan'],
    ['ChoThanhToan', '0.00', 'ChuaThanhToan'],
    ['DaXacNhan', '100000.00', 'DaDatCoc'],
    ['DaTiepDon', '100000.00', 'DaDatCoc'],
    ['HoanThanh', '100000.00', 'DaDatCoc'],
    ['VangMat', '100000.00', 'DaDatCoc'],
    ['DaXacNhan', '0.00', 'KhongCoc'],
    ['HoanThanh', '0', 'KhongCoc'],
    ['DaTiepDon', '0.00', 'KhongCoc'],
    ['DaHuy', '100000.00', 'KhongApDung'],
    ['DaHuy', '0.00', 'KhongApDung'],
    ['DaDoiLich', '100000.00', 'KhongApDung'],
    ['', '100000.00', 'KhongApDung'],
  ] as const)('UIF-09 %s với cọc %s ⇒ %s', (trangThai, tienCoc, expected) => {
    expect(paymentSummary(trangThai, tienCoc)).toBe(expected);
  });

  it.each([
    ['0.10', 'DaDatCoc'],
    ['0.01', 'DaDatCoc'],
    ['0.00', 'KhongCoc'],
    ['00.00', 'KhongCoc'],
    // Chuỗi không đúng dạng decimal không bao giờ được coi là có cọc
    ['abc', 'KhongCoc'],
    ['', 'KhongCoc'],
    ['-100.00', 'KhongCoc'],
  ] as const)(
    'UIF-09 biên của cọc %s (lịch `DaXacNhan`) ⇒ %s: chỉ hỏi "lớn hơn 0 không" trên chuỗi',
    (tienCoc, expected) => {
      expect(paymentSummary('DaXacNhan', tienCoc)).toBe(expected);
    },
  );

  it('UIF-09 không có nhãn "đủ" nào: kết quả chỉ nằm trong bốn giá trị và chữ của bốn giá trị không nói "thanh toán đủ"', () => {
    const results = new Set<string>();
    for (const trangThai of [
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'VangMat',
      'DaDoiLich',
    ]) {
      for (const tienCoc of ['0.00', '100000.00']) {
        results.add(paymentSummary(trangThai, tienCoc));
      }
    }
    expect([...results].sort()).toEqual(
      ['ChuaThanhToan', 'DaDatCoc', 'KhongApDung', 'KhongCoc'].sort(),
    );
    for (const label of Object.values(LIST_TEXT.payment)) {
      expect(label).not.toMatch(/đủ/i);
    }
  });
});
