import { describe, expect, it } from 'vitest';
import {
  NO_REFUND_POLICY_TEXT,
  refundPolicyLines,
} from './refund-policy-lines';

// booking F5. XNR-05 là [đề xuất] (PLAN booking mục 7.40): câu chính sách hoàn cọc từ `tomTat.chinhSachHoan`. Hàm thuần, không tính tiền. Mốc áp theo cách backend (`calculateRefund`):
// mốc có số giờ LỚN NHẤT mà thời gian còn lại ≥ số giờ; không mốc nào ⇒ 0%.
const tier = (soGioTruocToiThieu: number, tyLeHoan: number) => ({
  soGioTruocToiThieu,
  tyLeHoan,
});

describe('booking F5 — câu chính sách hoàn (XNR-05)', () => {
  it('XNR-05 WZ-04 `null` (cọc 0đ) ⇒ không có khối', () => {
    expect(refundPolicyLines(null)).toBeNull();
  });

  it('XNR-05 mảng rỗng (cọc > 0 chưa có mốc) ⇒ không hoàn (Q15)', () => {
    expect(refundPolicyLines([])).toEqual([NO_REFUND_POLICY_TEXT]);
    expect(NO_REFUND_POLICY_TEXT).toBe('Không hoàn cọc khi hủy lịch.');
  });

  it('XNR-05 mốc mẫu 24 → 100, 2 → 50, 0 → 0 ⇒ ba dòng đúng thứ tự, mốc 0% là "không hoàn"', () => {
    expect(refundPolicyLines([tier(24, 100), tier(2, 50), tier(0, 0)])).toEqual(
      [
        'Hủy từ 24 giờ trở lên trước giờ hẹn: hoàn 100%',
        'Hủy từ 2 đến dưới 24 giờ trước giờ hẹn: hoàn 50%',
        'Hủy dưới 2 giờ trước giờ hẹn: không hoàn',
      ],
    );
  });

  it('XNR-05 mốc thấp nhất lớn hơn 0 giờ ⇒ thêm dòng "dưới … giờ: không hoàn" (không mốc nào áp dụng ⇒ 0%)', () => {
    expect(refundPolicyLines([tier(24, 100)])).toEqual([
      'Hủy từ 24 giờ trở lên trước giờ hẹn: hoàn 100%',
      'Hủy dưới 24 giờ trước giờ hẹn: không hoàn',
    ]);
    expect(refundPolicyLines([tier(48, 80), tier(6, 30)])).toEqual([
      'Hủy từ 48 giờ trở lên trước giờ hẹn: hoàn 80%',
      'Hủy từ 6 đến dưới 48 giờ trước giờ hẹn: hoàn 30%',
      'Hủy dưới 6 giờ trước giờ hẹn: không hoàn',
    ]);
  });

  it('XNR-05 biên: một mốc duy nhất 0 giờ ⇒ "bất kỳ lúc nào"; tỷ lệ 0 và 100; không thêm dòng thừa', () => {
    expect(refundPolicyLines([tier(0, 100)])).toEqual([
      'Hủy bất kỳ lúc nào: hoàn 100%',
    ]);
    expect(refundPolicyLines([tier(0, 0)])).toEqual([
      'Hủy bất kỳ lúc nào: không hoàn',
    ]);
    expect(refundPolicyLines([tier(1, 100), tier(0, 0)])).toEqual([
      'Hủy từ 1 giờ trở lên trước giờ hẹn: hoàn 100%',
      'Hủy dưới 1 giờ trước giờ hẹn: không hoàn',
    ]);
  });
});
