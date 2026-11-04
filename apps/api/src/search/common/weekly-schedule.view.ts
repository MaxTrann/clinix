// Giờ nhận khám trong tuần của một chi nhánh (Q4): luôn đủ 7 phần tử (thứ 1 = Thứ Hai … 7 = Chủ Nhật theo ISO);
// thứ chưa khai báo hoặc không hoạt động ⇒ `hoatDong: null` (giao diện hiện "Nghỉ").

export interface ScheduleRow {
  thuTrongTuan: number;
  hoatDong: boolean;
  gioBatDauSang: string | null;
  gioKetThucSang: string | null;
  gioBatDauChieu: string | null;
  gioKetThucChieu: string | null;
}

export interface TimeRange {
  tu: string;
  den: string;
}

export interface WeekdayView {
  thuTrongTuan: number;
  hoatDong: { sang: TimeRange | null; chieu: TimeRange | null } | null;
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

// 'HH:MM:SS' của MySQL ⇒ 'HH:MM'
const hhmm = (value: string): string => value.slice(0, 5);

function range(from: string | null, to: string | null): TimeRange | null {
  return from && to ? { tu: hhmm(from), den: hhmm(to) } : null;
}

export function buildWeeklySchedule(
  rows: readonly ScheduleRow[],
): WeekdayView[] {
  const byWeekday = new Map(rows.map((row) => [row.thuTrongTuan, row]));
  return WEEKDAYS.map((thuTrongTuan) => {
    const row = byWeekday.get(thuTrongTuan);
    if (!row?.hoatDong) return { thuTrongTuan, hoatDong: null };
    return {
      thuTrongTuan,
      hoatDong: {
        sang: range(row.gioBatDauSang, row.gioKetThucSang),
        chieu: range(row.gioBatDauChieu, row.gioKetThucChieu),
      },
    };
  });
}
