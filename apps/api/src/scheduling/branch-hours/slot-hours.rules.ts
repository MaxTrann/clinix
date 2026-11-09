import { weekdayVN } from '../../common/time/time.js';
import type {
  BranchDayHours,
  CaLamViec,
  HoursViolation,
  ShiftRange,
} from './branch-hours.types.js';
import { shiftWindow } from './shift-window.rules.js';
import { formatHHMM, secondsOfDayVN } from './time-of-day.js';

export type SlotWithinHoursResult =
  | { ok: true }
  | {
      ok: false;
      lyDo: HoursViolation;
      chiTiet: {
        thuTrongTuan: number;
        gioMo?: string;
        gioDong?: string;
        khoang?: ShiftRange;
      };
    };

/** Khung giờ [ngayGio, ngayGio + thoiLuong] phải nằm TRỌN trong khoảng của ca (biên hai đầu hợp lệ). Booking và search gọi hàm này (D2). */
export function checkSlotWithinBranchHours(input: {
  ngayGio: Date;
  thoiLuongPhut: number;
  ca: CaLamViec;
  ngayHoatDong: BranchDayHours | null;
}): SlotWithinHoursResult {
  const { ngayHoatDong } = input;
  const thuTrongTuan = weekdayVN(input.ngayGio);
  const ranges = [ngayHoatDong?.sang, ngayHoatDong?.chieu].filter(
    (range): range is ShiftRange => Boolean(range),
  );
  // Giờ mở/đóng của cả ngày (sớm nhất / muộn nhất) để báo lỗi dễ hiểu.
  const gio =
    ngayHoatDong?.hoatDong && ranges.length > 0
      ? {
          gioMo: formatHHMM(Math.min(...ranges.map((r) => r.tuGiay))),
          gioDong: formatHHMM(Math.max(...ranges.map((r) => r.denGiay))),
        }
      : {};

  const window = shiftWindow(input.ca, ngayHoatDong);
  if (!window.ok)
    return { ok: false, lyDo: window.lyDo, chiTiet: { thuTrongTuan, ...gio } };

  const start = secondsOfDayVN(input.ngayGio);
  const end = start + input.thoiLuongPhut * 60;
  if (start >= window.khoang.tuGiay && end <= window.khoang.denGiay)
    return { ok: true };
  return {
    ok: false,
    lyDo: 'NgoaiGioHoatDong',
    chiTiet: { thuTrongTuan, ...gio, khoang: window.khoang },
  };
}
