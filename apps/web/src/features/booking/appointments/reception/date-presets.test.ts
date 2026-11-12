import { describe, expect, it } from 'vitest';
import { DATE_PRESETS, presetRange } from './date-presets';

// booking F8, mức hàm của LTL-01 (Hôm nay), LTL-02 (Ngày mai), LTL-03 (Tuần này), LTL-04 (Khoảng ngày). Mã LTL là [đề xuất] (PLAN booking mục 7.34). `today` là ngày
// Việt Nam `YYYY-MM-DD` do nơi gọi truyền: ở trang là `todayVn()` (giờ Việt Nam từ đồng hồ máy, kiểm ở `reception-list-page-dates.test.tsx`).
const NONE = { from: '', to: '' };

describe('booking F8 — chip ngày của Lễ tân', () => {
  it('LTL-01 thứ tự và chữ của Figma `479:2`', () => {
    expect(DATE_PRESETS.map((preset) => preset.label)).toEqual([
      'Hôm nay',
      'Ngày mai',
      'Tuần này',
      'Khoảng ngày',
    ]);
  });

  it('LTL-01 Hôm nay là đúng một ngày, hai đầu bằng nhau', () => {
    expect(presetRange('today', '2026-10-18', NONE)).toEqual({
      from: '2026-10-18',
      to: '2026-10-18',
    });
  });

  // Biên: qua tháng, qua năm, năm nhuận (cộng ngày ở UTC trên ba số, không theo múi giờ máy)
  it('LTL-02 Ngày mai: cuối tháng, cuối năm, 28/02 năm nhuận và không nhuận', () => {
    expect(presetRange('tomorrow', '2026-10-18', NONE).from).toBe('2026-10-19');
    expect(presetRange('tomorrow', '2026-10-31', NONE).to).toBe('2026-11-01');
    expect(presetRange('tomorrow', '2026-12-31', NONE).from).toBe('2027-01-01');
    expect(presetRange('tomorrow', '2028-02-28', NONE).from).toBe('2028-02-29');
    expect(presetRange('tomorrow', '2026-02-28', NONE).from).toBe('2026-03-01');
  });

  // 14/10/2026 là Thứ 4; 18/10/2026 là Chủ nhật; 19/10/2026 là Thứ 2 (Figma ghi 18/10 là Chủ nhật)
  it('LTL-03 Tuần này là thứ Hai đến Chủ nhật của tuần chứa hôm nay', () => {
    const week = { from: '2026-10-12', to: '2026-10-18' };
    expect(presetRange('week', '2026-10-14', NONE)).toEqual(week);
    // Biên: thứ Hai (đầu tuần) và Chủ nhật (cuối tuần) đều thuộc CÙNG một tuần
    expect(presetRange('week', '2026-10-12', NONE)).toEqual(week);
    expect(presetRange('week', '2026-10-18', NONE)).toEqual(week);
    // Chủ nhật thuộc tuần TRƯỚC thứ Hai kế tiếp
    expect(presetRange('week', '2026-10-19', NONE)).toEqual({
      from: '2026-10-19',
      to: '2026-10-25',
    });
  });

  it('LTL-03 Tuần này qua tháng và qua năm', () => {
    // 29/12/2026 là Thứ 3: tuần 28/12/2026 đến 03/01/2027
    expect(presetRange('week', '2026-12-29', NONE)).toEqual({
      from: '2026-12-28',
      to: '2027-01-03',
    });
    // 01/03/2026 là Chủ nhật: tuần 23/02 đến 01/03
    expect(presetRange('week', '2026-03-01', NONE)).toEqual({
      from: '2026-02-23',
      to: '2026-03-01',
    });
  });

  it('LTL-04 Khoảng ngày dùng đúng khoảng người dùng nhập, kể cả một đầu hay cả hai đầu trống; không phụ thuộc hôm nay', () => {
    const custom = { from: '2026-10-01', to: '2026-10-31' };
    expect(presetRange('range', '2026-10-18', custom)).toBe(custom);
    expect(presetRange('range', '2030-01-01', custom)).toBe(custom);
    expect(presetRange('range', '2026-10-18', NONE)).toEqual(NONE);
    expect(
      presetRange('range', '2026-10-18', { from: '2026-10-01', to: '' }),
    ).toEqual({
      from: '2026-10-01',
      to: '',
    });
  });

  it('LTL-01 ba chip còn lại bỏ qua khoảng người dùng đã nhập (đổi chip không rò khoảng cũ)', () => {
    const custom = { from: '2020-01-01', to: '2020-01-02' };
    for (const preset of ['today', 'tomorrow', 'week'] as const) {
      const range = presetRange(preset, '2026-10-18', custom);
      expect(range.from >= '2026-10-12').toBe(true);
      expect(range.to).not.toBe('2020-01-02');
    }
  });
});
