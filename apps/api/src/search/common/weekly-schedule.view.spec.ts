import {
  buildWeeklySchedule,
  type ScheduleRow,
} from './weekly-schedule.view.js';

const row = (
  thuTrongTuan: number,
  extra: Partial<ScheduleRow> = {},
): ScheduleRow => ({
  thuTrongTuan,
  hoatDong: true,
  gioBatDauSang: '08:00:00',
  gioKetThucSang: '12:00:00',
  gioBatDauChieu: '13:00:00',
  gioKetThucChieu: '17:00:00',
  ...extra,
});

describe('P1 — buildWeeklySchedule (7 dòng ⇒ 7 phần tử, thứ thiếu ⇒ null)', () => {
  it('không có dòng nào: đủ 7 thứ, đều hoatDong null', () => {
    const view = buildWeeklySchedule([]);
    expect(view.map((d) => d.thuTrongTuan)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(view.every((d) => d.hoatDong === null)).toBe(true);
  });

  it('đủ 7 dòng: giờ cắt còn HH:MM, đúng thứ tự dù đầu vào xáo trộn', () => {
    const view = buildWeeklySchedule([7, 3, 1, 2, 6, 4, 5].map((n) => row(n)));
    expect(view.map((d) => d.thuTrongTuan)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(view[0]?.hoatDong).toEqual({
      sang: { tu: '08:00', den: '12:00' },
      chieu: { tu: '13:00', den: '17:00' },
    });
  });

  it('thiếu thứ 4 và thứ 7: hai thứ đó null, các thứ còn lại giữ nguyên', () => {
    const view = buildWeeklySchedule([1, 2, 3, 5, 6].map((n) => row(n)));
    expect(view[3]?.hoatDong).toBeNull();
    expect(view[6]?.hoatDong).toBeNull();
    expect(view[4]?.hoatDong).not.toBeNull();
  });

  it('thứ không hoạt động ⇒ null; chỉ có ca sáng ⇒ chieu null', () => {
    const view = buildWeeklySchedule([
      row(1, { hoatDong: false }),
      row(2, { gioBatDauChieu: null, gioKetThucChieu: null }),
    ]);
    expect(view[0]?.hoatDong).toBeNull();
    expect(view[1]?.hoatDong).toEqual({
      sang: { tu: '08:00', den: '12:00' },
      chieu: null,
    });
  });
});
