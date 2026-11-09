import type { BranchDayHours } from '../branch-hours/branch-hours.types.js';
import { shiftWindow } from '../branch-hours/shift-window.rules.js';
import { formatHHMM } from '../branch-hours/time-of-day.js';
import { generateSlotStarts } from './slot-generator.rules.js';

// Doctor P2 — generateSlotStarts: SG-01…SG-05, SG-08, SG-10 (phần thuần), SG-12, SG-14.
const gio = (h: number, m = 0, s = 0) => h * 3600 + m * 60 + s;
const hhmm = (starts: number[]) => starts.map(formatHHMM);

describe('generateSlotStarts', () => {
  it('SG-01 07:30–11:00, 50 phút ⇒ 07:30, 08:20, 09:10, 10:00 (bỏ 10 phút cuối)', () => {
    expect(
      hhmm(generateSlotStarts({ tuGiay: gio(7, 30), denGiay: gio(11) }, 50)),
    ).toEqual(['07:30', '08:20', '09:10', '10:00']);
  });

  it('SG-02 08:00–12:00, 30 phút ⇒ 8 ô, ô cuối 11:30', () => {
    const starts = hhmm(
      generateSlotStarts({ tuGiay: gio(8), denGiay: gio(12) }, 30),
    );
    expect(starts).toHaveLength(8);
    expect(starts.at(-1)).toBe('11:30');
  });

  it('SG-03 13:00–17:00, 60 phút ⇒ 4 ô', () => {
    expect(
      hhmm(generateSlotStarts({ tuGiay: gio(13), denGiay: gio(17) }, 60)),
    ).toEqual(['13:00', '14:00', '15:00', '16:00']);
  });

  it('SG-04 thời lượng lớn hơn khoảng ⇒ rỗng', () => {
    expect(generateSlotStarts({ tuGiay: gio(8), denGiay: gio(9) }, 61)).toEqual(
      [],
    );
  });

  it('SG-05 08:00–09:00, 30 phút (kết thúc đúng giờ kết thúc) ⇒ 08:00, 08:30', () => {
    expect(
      hhmm(generateSlotStarts({ tuGiay: gio(8), denGiay: gio(9) }, 30)),
    ).toEqual(['08:00', '08:30']);
  });

  it('SG-08 CaChieu dùng khoảng chiều: không có ô nào nằm trong giờ nghỉ trưa 12:00–13:00', () => {
    const ngay: BranchDayHours = {
      hoatDong: true,
      sang: { tuGiay: gio(7, 30), denGiay: gio(12) },
      chieu: { tuGiay: gio(13), denGiay: gio(17) },
    };
    const window = shiftWindow('CaChieu', ngay);
    if (!window.ok) throw new Error('CaChieu phải tồn tại');
    const starts = generateSlotStarts(window.khoang, 50);
    // 16:20 + 50 phút = 17:10 vượt 17:00 nên bị bỏ
    expect(hhmm(starts)).toEqual(['13:00', '13:50', '14:40', '15:30']);
    expect(starts.every((s) => s >= gio(13) && s + 50 * 60 <= gio(17))).toBe(
      true,
    );
  });

  it('SG-10 dịch vụ 60 phút ⇒ các ô cách nhau đúng 60 phút', () => {
    const starts = generateSlotStarts({ tuGiay: gio(8), denGiay: gio(17) }, 60);
    expect(starts).toHaveLength(9);
    starts.slice(1).forEach((start, i) => {
      expect(start - (starts[i] as number)).toBe(3600);
    });
  });

  it('SG-12 23:00–23:59:59, 30 phút ⇒ chỉ ô 23:00', () => {
    expect(
      hhmm(
        generateSlotStarts({ tuGiay: gio(23), denGiay: gio(23, 59, 59) }, 30),
      ),
    ).toEqual(['23:00']);
  });

  it('khoảng rỗng (từ = đến) ⇒ rỗng, không lỗi', () => {
    expect(generateSlotStarts({ tuGiay: gio(8), denGiay: gio(8) }, 30)).toEqual(
      [],
    );
  });

  it('SG-14 thời lượng ≤ 0, không nguyên, NaN, hoặc khoảng ngược ⇒ ném lỗi (không lặp vô hạn)', () => {
    const khoang = { tuGiay: gio(8), denGiay: gio(12) };
    for (const bad of [0, -30, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => generateSlotStarts(khoang, bad), String(bad)).toThrow(
        /Thời lượng/,
      );
    expect(() =>
      generateSlotStarts({ tuGiay: gio(12), denGiay: gio(8) }, 30),
    ).toThrow(/ngược/);
  });
});
