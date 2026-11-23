import {
  addMonths,
  formatMonthLabel,
  monthGrid,
  monthStartOf,
} from '../../../shared/schedule/month';
import {
  addDays,
  formatWeekRange,
  isoWeekday,
  weekStartOf,
} from '../../../shared/schedule/week';
import {
  PICKER_MAX,
  PICKER_MIN,
  addMonthsKeepDay,
  addYearsKeepDay,
  clampDate,
  clampMonth,
  isDayEnabled,
  isGridKey,
  isMonthEnabled,
  moveDay,
  moveMonth,
  monthsOfYear,
} from './picker-dates';

// doctor UX5 (G2): hàm thuần của hộp chọn tuần/tháng. Mã DUX5-nn [đề xuất]; WL-11 = biên tuần (chủ nhật, đổi tháng/năm), WL-12 [đề xuất] = hộp chọn kỳ.
// Ngày nghiệp vụ là chuỗi `YYYY-MM-DD`; test KHÔNG dùng `new Date('YYYY-MM-DD')` (lệch UTC), chỉ `Date.UTC` theo số khi cần đếm ngày.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(from: string, to: string): number {
  const epoch = (iso: string) =>
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
    ) / 86_400_000;
  return epoch(to) - epoch(from);
}

describe('moveDay: phím trên lưới ngày', () => {
  it('DUX5-01 WL-11: ← → đi ±1 ngày, ↑ ↓ đi ±7 ngày, qua cuối tháng, cuối năm, đầu năm và năm nhuận', () => {
    expect(moveDay('2026-11-30', 'ArrowRight')).toBe('2026-12-01');
    expect(moveDay('2026-12-01', 'ArrowLeft')).toBe('2026-11-30');
    expect(moveDay('2026-12-31', 'ArrowRight')).toBe('2027-01-01');
    expect(moveDay('2026-01-01', 'ArrowLeft')).toBe('2025-12-31');
    expect(moveDay('2028-02-28', 'ArrowRight')).toBe('2028-02-29');
    expect(moveDay('2028-02-29', 'ArrowRight')).toBe('2028-03-01');
    expect(moveDay('2026-11-23', 'ArrowDown')).toBe('2026-11-30');
    expect(moveDay('2026-11-23', 'ArrowUp')).toBe('2026-11-16');
    expect(moveDay('2026-12-28', 'ArrowDown')).toBe('2027-01-04');
    expect(moveDay('2026-03-02', 'ArrowUp')).toBe('2026-02-23');
  });

  it('DUX5-02 WL-11: Home = thứ Hai, End = Chủ nhật của tuần chứa ngày (tuần bắt đầu thứ Hai)', () => {
    // Chủ nhật 29/11/2026 thuộc tuần 23/11 – 29/11, KHÔNG phải đầu tuần sau
    expect(moveDay('2026-11-29', 'Home')).toBe('2026-11-23');
    expect(moveDay('2026-11-29', 'End')).toBe('2026-11-29');
    // Thứ Hai: Home là chính nó
    expect(moveDay('2026-11-23', 'Home')).toBe('2026-11-23');
    expect(moveDay('2026-11-23', 'End')).toBe('2026-11-29');
    // Giữa tuần, tuần vắt qua hai tháng: thứ Năm 29/10/2026
    expect(moveDay('2026-10-29', 'Home')).toBe('2026-10-26');
    expect(moveDay('2026-10-29', 'End')).toBe('2026-11-01');
  });

  it('DUX5-03 PageUp/PageDown đi ±1 tháng GIỮ ngày và KẸP về cuối tháng (31/03 lùi một tháng ra 28/02 hoặc 29/02)', () => {
    expect(moveDay('2026-03-31', 'PageUp')).toBe('2026-02-28');
    expect(moveDay('2028-03-31', 'PageUp')).toBe('2028-02-29');
    expect(moveDay('2026-01-31', 'PageDown')).toBe('2026-02-28');
    expect(moveDay('2028-01-30', 'PageDown')).toBe('2028-02-29');
    expect(moveDay('2026-12-31', 'PageDown')).toBe('2027-01-31');
    expect(moveDay('2026-01-15', 'PageUp')).toBe('2025-12-15');
    expect(moveDay('2026-05-31', 'PageDown')).toBe('2026-06-30');
  });

  it('DUX5-04 Shift+PageUp/PageDown đi ±1 năm; 29/02 sang năm không nhuận kẹp về 28/02', () => {
    expect(moveDay('2028-02-29', 'PageDown', true)).toBe('2029-02-28');
    expect(moveDay('2028-02-29', 'PageUp', true)).toBe('2027-02-28');
    expect(moveDay('2026-11-23', 'PageDown', true)).toBe('2027-11-23');
    expect(moveDay('2026-11-23', 'PageUp', true)).toBe('2025-11-23');
    expect(addYearsKeepDay('2024-02-29', 4)).toBe('2028-02-29');
  });

  it('DUX5-05 kẹp biên 2000-01-01 … 2099-12-31: đi quá thì ở yên hoặc về đúng biên', () => {
    expect(moveDay(PICKER_MIN, 'ArrowLeft')).toBe(PICKER_MIN);
    expect(moveDay(PICKER_MIN, 'ArrowUp')).toBe(PICKER_MIN);
    expect(moveDay(PICKER_MAX, 'ArrowRight')).toBe(PICKER_MAX);
    expect(moveDay(PICKER_MAX, 'ArrowDown')).toBe(PICKER_MAX);
    expect(moveDay('2000-01-15', 'PageUp')).toBe(PICKER_MIN);
    expect(moveDay('2099-03-10', 'PageDown', true)).toBe(PICKER_MAX);
    expect(moveDay('2000-06-10', 'PageUp', true)).toBe(PICKER_MIN);
    // 01/01/2000 là thứ Bảy: Home kẹp về chính nó chứ không về 27/12/1999
    expect(moveDay(PICKER_MIN, 'Home')).toBe(PICKER_MIN);
    // 31/12/2099 là thứ Năm: End kẹp về chính nó chứ không sang 03/01/2100
    expect(moveDay(PICKER_MAX, 'End')).toBe(PICKER_MAX);
  });

  it('DUX5-06 phím khác trả null (không nuốt phím của trình duyệt)', () => {
    for (const key of ['a', 'Enter', ' ', 'Tab', 'Escape', 'Shift', 'F5']) {
      expect(moveDay('2026-11-23', key)).toBeNull();
      expect(isGridKey(key)).toBe(false);
    }
    for (const key of [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ]) {
      expect(isGridKey(key)).toBe(true);
    }
  });
});

describe('moveMonth: phím trên lưới 12 tháng', () => {
  it('DUX5-07 ← → ±1, ↑ ↓ ±3, Home/End = tháng 1/tháng 12 của năm, PageUp/PageDown ±12; qua năm và kẹp biên', () => {
    expect(moveMonth('2026-05-01', 'ArrowRight')).toBe('2026-06-01');
    expect(moveMonth('2026-05-01', 'ArrowLeft')).toBe('2026-04-01');
    expect(moveMonth('2026-12-01', 'ArrowRight')).toBe('2027-01-01');
    expect(moveMonth('2026-01-01', 'ArrowLeft')).toBe('2025-12-01');
    expect(moveMonth('2026-05-01', 'ArrowDown')).toBe('2026-08-01');
    expect(moveMonth('2026-05-01', 'ArrowUp')).toBe('2026-02-01');
    expect(moveMonth('2026-11-01', 'ArrowDown')).toBe('2027-02-01');
    expect(moveMonth('2026-05-01', 'Home')).toBe('2026-01-01');
    expect(moveMonth('2026-05-01', 'End')).toBe('2026-12-01');
    expect(moveMonth('2026-05-01', 'PageDown')).toBe('2027-05-01');
    expect(moveMonth('2026-05-01', 'PageUp')).toBe('2025-05-01');
    // biên
    expect(moveMonth('2000-01-01', 'ArrowLeft')).toBe('2000-01-01');
    expect(moveMonth('2000-02-01', 'PageUp')).toBe('2000-01-01');
    expect(moveMonth('2099-12-01', 'ArrowRight')).toBe('2099-12-01');
    expect(moveMonth('2099-06-01', 'PageDown')).toBe('2099-12-01');
    expect(moveMonth('2026-05-01', 'Enter')).toBeNull();
  });

  it('DUX5-08 monthsOfYear: đúng 12 đầu tháng theo thứ tự, năm thường và năm nhuận, đều có đuôi -01', () => {
    for (const year of [2026, 2028, 2000, 2099]) {
      const months = monthsOfYear(year);
      expect(months).toHaveLength(12);
      expect(months[0]).toBe(`${year}-01-01`);
      expect(months[11]).toBe(`${year}-12-01`);
      months.forEach((month, index) => {
        expect(month).toBe(`${year}-${String(index + 1).padStart(2, '0')}-01`);
        expect(month.endsWith('-01')).toBe(true);
      });
    }
  });
});

describe('biên của hộp chọn', () => {
  it('DUX5-09 clampDate, clampMonth, isDayEnabled, isMonthEnabled đúng ở hai đầu biên', () => {
    expect(PICKER_MIN).toBe('2000-01-01');
    expect(PICKER_MAX).toBe('2099-12-31');
    expect(isDayEnabled('1999-12-31')).toBe(false);
    expect(isDayEnabled('2000-01-01')).toBe(true);
    expect(isDayEnabled('2026-11-23')).toBe(true);
    expect(isDayEnabled('2099-12-31')).toBe(true);
    expect(isDayEnabled('2100-01-01')).toBe(false);
    expect(isMonthEnabled('1999-12-01')).toBe(false);
    expect(isMonthEnabled('2000-01-01')).toBe(true);
    expect(isMonthEnabled('2099-12-01')).toBe(true);
    expect(isMonthEnabled('2100-01-01')).toBe(false);
    expect(clampDate('1950-05-05')).toBe(PICKER_MIN);
    expect(clampDate('2150-05-05')).toBe(PICKER_MAX);
    expect(clampDate('2026-11-23')).toBe('2026-11-23');
    expect(clampMonth('1950-05-01')).toBe('2000-01-01');
    expect(clampMonth('2150-05-01')).toBe('2099-12-01');
    expect(clampMonth('2026-05-01')).toBe('2026-05-01');
  });
});

describe('tuần chứa ngày được chọn (hàm sẵn có của shared/schedule, tuần T2–CN)', () => {
  it('DUX5-10 WL-11: Chủ nhật, thứ Hai, tuần vắt tháng, vắt năm, 29/02 năm nhuận', () => {
    const label = (day: string) => formatWeekRange(weekStartOf(day));
    // Chủ nhật vẫn ở tuần TRƯỚC thứ Hai kế tiếp
    expect(label('2026-11-29')).toBe('23/11 – 29/11/2026');
    // Thứ Hai bắt đầu tuần mới; tuần vắt qua hai tháng
    expect(label('2026-11-30')).toBe('30/11 – 06/12/2026');
    expect(label('2026-10-29')).toBe('26/10 – 01/11/2026');
    // Thứ Năm 01/01/2026: tuần bắt đầu ở năm trước, nhãn lấy năm theo ngày cuối
    expect(weekStartOf('2026-01-01')).toBe('2025-12-29');
    expect(label('2026-01-01')).toBe('29/12 – 04/01/2026');
    // 29/02/2028 là thứ Ba
    expect(isoWeekday('2028-02-29')).toBe(2);
    expect(label('2028-02-29')).toBe('28/02 – 05/03/2028');
    // Hai biên của hộp chọn
    expect(label(PICKER_MIN)).toBe('27/12 – 02/01/2000');
    expect(isoWeekday(PICKER_MAX)).toBe(4);
    expect(label(PICKER_MAX)).toBe('28/12 – 03/01/2100');
  });
});

// Bản chép quy tắc của API (schedule-view.rules.ts dòng 19 và 32 + calendar-date.ts dòng 3): hai ngày dạng YYYY-MM-DD, denNgay >= tuNgay, tối đa 42 ngày
function apiAccepts(from: string, to: string): boolean {
  return (
    ISO.test(from) &&
    ISO.test(to) &&
    to >= from &&
    daysBetween(from, to) + 1 <= 42
  );
}

describe('mọi kỳ chọn được đều hợp lệ với GET /doctor/schedule', () => {
  it('DUX5-11 WL-11, WL-12: quét 1.200 tháng và mọi tuần của 2000 đến 2099: khoảng tải ≤ 42 ngày, T2 đến CN, năm 4 chữ số (không gây 400)', () => {
    let month = monthStartOf(PICKER_MIN);
    let months = 0;
    while (month <= monthStartOf(PICKER_MAX)) {
      const { gridStart, gridEnd, weeks } = monthGrid(month);
      expect(
        apiAccepts(gridStart, gridEnd),
        `lưới tháng ${formatMonthLabel(month)}: ${gridStart} … ${gridEnd}`,
      ).toBe(true);
      expect(isoWeekday(gridStart)).toBe(1);
      expect(isoWeekday(gridEnd)).toBe(7);
      expect(weeks.length).toBeLessThanOrEqual(6);
      months += 1;
      month = addMonths(month, 1);
    }
    expect(months).toBe(1200);

    let weeksChecked = 0;
    for (
      let start = weekStartOf(PICKER_MIN);
      start <= PICKER_MAX;
      start = addDays(start, 7)
    ) {
      const end = addDays(start, 6);
      expect(apiAccepts(start, end), `tuần ${start} … ${end}`).toBe(true);
      expect(isoWeekday(start)).toBe(1);
      weeksChecked += 1;
    }
    expect(weeksChecked).toBeGreaterThan(5000);

    // Đối chứng: bộ kiểm không "luôn đúng"
    expect(apiAccepts('2026-11-01', '2026-12-12')).toBe(true); // đúng 42 ngày
    expect(apiAccepts('2026-11-01', '2026-12-13')).toBe(false); // 43 ngày
    expect(apiAccepts('2026-11-05', '2026-11-04')).toBe(false); // đảo ngược
    expect(apiAccepts('2026-11-01', '+010000-01')).toBe(false); // năm 5 chữ số (lỗi tràn của web)
  });
});

describe('tính ngày không phụ thuộc múi giờ máy', () => {
  const files = import.meta.glob(
    [
      './picker-dates.ts',
      './picker-styles.ts',
      './day-picker.tsx',
      './month-picker.tsx',
      './period-picker.tsx',
    ],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>;

  // Bỏ chú thích (câu giải thích có thể nhắc `new Date(`) rồi tìm chỗ dựng `Date` từ chuỗi hoặc đọc giờ máy
  const strip = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const usesLocalDate = (source: string) =>
    /new\s+Date\s*\(|Date\.parse\s*\(|Date\.now\s*\(/.test(strip(source));

  it('DUX5-12 file mã của hộp chọn không dựng `Date` (chỉ chuỗi YYYY-MM-DD và hàm của shared/schedule)', () => {
    expect(Object.keys(files).sort()).toEqual([
      './day-picker.tsx',
      './month-picker.tsx',
      './period-picker.tsx',
      './picker-dates.ts',
      './picker-styles.ts',
    ]);
    for (const [name, source] of Object.entries(files)) {
      expect(usesLocalDate(source), `${name} dựng Date`).toBe(false);
    }
  });

  it('DUX5-12 bộ quét có tác dụng: bắt `new Date(chuỗi)`, `Date.parse`, `Date.now`; bỏ qua chú thích', () => {
    expect(usesLocalDate("const d = new Date('2026-11-23');")).toBe(true);
    expect(usesLocalDate('const t = Date.parse(text);')).toBe(true);
    expect(usesLocalDate('const t = Date.now();')).toBe(true);
    expect(usesLocalDate('// không dùng new Date(chuỗi)\nconst a = 1;')).toBe(
      false,
    );
    expect(usesLocalDate('/* new Date(x) */ const a = 1;')).toBe(false);
  });
});

describe('định dạng kết quả', () => {
  it('DUX5-13 mọi hàm trả ngày đúng dạng YYYY-MM-DD (kể cả khi kẹp)', () => {
    const results = [
      moveDay('2026-11-23', 'ArrowRight'),
      moveDay('2026-03-31', 'PageUp'),
      moveDay('2028-02-29', 'PageDown', true),
      moveDay(PICKER_MIN, 'ArrowLeft'),
      moveDay(PICKER_MAX, 'End'),
      moveMonth('2026-05-01', 'End'),
      moveMonth('2000-01-01', 'PageUp'),
      addMonthsKeepDay('2026-01-31', 1),
      addYearsKeepDay('2028-02-29', 1),
      clampDate('1900-01-01'),
      clampMonth('2200-01-01'),
      ...monthsOfYear(2026),
    ];
    for (const value of results) expect(value).toMatch(ISO);
  });
});
