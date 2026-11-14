import { describe, expect, it } from 'vitest';
import { formatVietnamShortWeekdayDate } from './appointment-format';
import { presetRange } from './date-presets';

// booking F11: hai chip mới của Bác sĩ (`Tuần sau`, `Tháng này`) ở hàm thuần dùng chung, và ngày ngắn có thứ của danh sách. Mã DAF-03, DAF-04 và DAL-05 là [đề xuất] (PLAN booking mục 7.44). Bốn chip còn lại
// của F8 (LTL-01…LTL-04) vẫn do `reception/date-presets.test.ts` canh. `today` là ngày Việt Nam do nơi gọi truyền (ở trang là `todayVn()`).
const NONE = { from: '', to: '' };

describe('booking F11 — chip `Tuần sau` và `Tháng này`', () => {
  // 14/10/2026 là Thứ 4; 18/10/2026 là Chủ nhật; 19/10/2026 là Thứ 2
  it('DAF-03 Tuần sau là thứ Hai đến Chủ nhật của tuần KẾ TIẾP, kể cả khi hôm nay là thứ Hai hay Chủ nhật', () => {
    const next = { from: '2026-10-19', to: '2026-10-25' };
    expect(presetRange('nextWeek', '2026-10-14', NONE)).toEqual(next);
    // Thứ Hai và Chủ nhật của tuần này (12 đến 18/10) đều cho cùng một tuần sau
    expect(presetRange('nextWeek', '2026-10-12', NONE)).toEqual(next);
    expect(presetRange('nextWeek', '2026-10-18', NONE)).toEqual(next);
    // Chủ nhật 18/10 thuộc tuần TRƯỚC thứ Hai 19/10: sang thứ Hai thì tuần sau lùi thêm một tuần
    expect(presetRange('nextWeek', '2026-10-19', NONE)).toEqual({
      from: '2026-10-26',
      to: '2026-11-01',
    });
  });

  it('DAF-03 Tuần sau qua tháng và qua năm', () => {
    // 29/12/2026 là Thứ 3: tuần này 28/12 đến 03/01/2027, tuần sau 04/01 đến 10/01/2027
    expect(presetRange('nextWeek', '2026-12-29', NONE)).toEqual({
      from: '2027-01-04',
      to: '2027-01-10',
    });
    expect(presetRange('nextWeek', '2026-10-28', NONE)).toEqual({
      from: '2026-11-02',
      to: '2026-11-08',
    });
  });

  it('DAF-04 Tháng này là ngày 1 đến ngày cuối của tháng chứa hôm nay: tháng 31 ngày, tháng 30 ngày, tháng 2 (nhuận và không nhuận), tháng 12', () => {
    expect(presetRange('month', '2026-10-18', NONE)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(presetRange('month', '2026-11-30', NONE)).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(presetRange('month', '2026-02-10', NONE)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(presetRange('month', '2028-02-29', NONE)).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(presetRange('month', '2026-12-31', NONE)).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
    // Biên: ngày đầu và ngày cuối của tháng cho CÙNG một khoảng
    expect(presetRange('month', '2026-10-01', NONE)).toEqual(
      presetRange('month', '2026-10-31', NONE),
    );
  });

  it('DAF-04 `Tùy chọn` dùng đúng khoảng đã nhập (đầu trống là không ràng buộc), không đụng tới hôm nay', () => {
    expect(presetRange('range', '2026-10-18', NONE)).toEqual(NONE);
    expect(
      presetRange('range', '2026-10-18', { from: '2026-10-01', to: '' }),
    ).toEqual({ from: '2026-10-01', to: '' });
  });
});

describe('booking F11 — ngày ngắn có thứ của danh sách Bác sĩ', () => {
  it('DAL-05 "T3, 20/10/2026" và "CN, 18/10/2026" như Figma `457:2`; đủ bảy thứ', () => {
    expect(formatVietnamShortWeekdayDate('2026-10-20T01:00:00.000Z')).toBe(
      'T3, 20/10/2026',
    );
    expect(formatVietnamShortWeekdayDate('2026-10-18T01:00:00.000Z')).toBe(
      'CN, 18/10/2026',
    );
    const labels = [19, 20, 21, 22, 23, 24, 25].map((day) =>
      formatVietnamShortWeekdayDate(`2026-10-${day}T03:00:00.000Z`).slice(0, 2),
    );
    expect(labels).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
  });

  it('DAL-05 theo NGÀY giờ Việt Nam, không theo UTC: 16:59:59Z còn T7 17/10, 17:00:00Z đã là CN 18/10; qua năm', () => {
    expect(formatVietnamShortWeekdayDate('2026-10-17T16:59:59.000Z')).toBe(
      'T7, 17/10/2026',
    );
    expect(formatVietnamShortWeekdayDate('2026-10-17T17:00:00.000Z')).toBe(
      'CN, 18/10/2026',
    );
    // 31/12/2026 17:00Z là 00:00 ngày 01/01/2027 (Thứ 6)
    expect(formatVietnamShortWeekdayDate('2026-12-31T17:00:00.000Z')).toBe(
      'T6, 01/01/2027',
    );
  });
});
