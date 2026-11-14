import { addDays, weekStartOf } from '../../../../shared/schedule/week';
import {
  lastDayOfMonth,
  monthStartOf,
} from '../../../../shared/schedule/month';
import type { DateRange } from './date-range';

// Chip ngày của các trang danh sách lịch hẹn (booking F8 viết ở `reception/date-presets.ts` với bốn chip của Lễ tân (Figma `479:2`), chuyển lên `common/` ở F11: Bác sĩ có sáu chip (Figma `457:2`); PLAN Q32,
// Q33: là hai tham số `tuNgay`, `denNgay` do FE tính theo giờ Việt Nam). Hàm thuần: `today` là ngày Việt Nam `YYYY-MM-DD` do nơi gọi lấy từ `todayVn()` (test truyền ngày cố định hay đồng hồ giả), nên
// không có chỗ nào ở đây đọc đồng hồ hay múi giờ của máy. Cộng ngày làm ở UTC trên ba số năm-tháng-ngày (`shared/schedule`): qua tháng, qua năm, năm nhuận đều đúng.
export type DatePreset =
  'today' | 'tomorrow' | 'week' | 'nextWeek' | 'month' | 'range';

// Một chip của một trang: mã và chữ (mỗi trang tự chọn tập và thứ tự chip, chữ của Figma của mình)
export interface DatePresetOption {
  id: DatePreset;
  label: string;
}

// Số ngày của một tuần T2 đến CN; `Tuần này` là thứ Hai đến Chủ nhật của tuần chứa hôm nay (Chủ nhật thuộc tuần TRƯỚC thứ Hai kế tiếp, như lịch Việt Nam và `weekStartOf`)
const LAST_DAY_OF_WEEK_OFFSET = 6;
const DAYS_IN_WEEK = 7;

// Khoảng ngày gửi lên API cho chip đang chọn. `range` dùng khoảng người dùng đã nhập (`custom`; ô trống thì không ràng buộc đầu đó, cả hai trống là mọi ngày).
export function presetRange(
  preset: DatePreset,
  today: string,
  custom: DateRange,
): DateRange {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'tomorrow': {
      const tomorrow = addDays(today, 1);
      return { from: tomorrow, to: tomorrow };
    }
    case 'week': {
      const monday = weekStartOf(today);
      return { from: monday, to: addDays(monday, LAST_DAY_OF_WEEK_OFFSET) };
    }
    case 'nextWeek': {
      // Thứ Hai của tuần kế tiếp: bảy ngày sau thứ Hai của tuần này
      const monday = addDays(weekStartOf(today), DAYS_IN_WEEK);
      return { from: monday, to: addDays(monday, LAST_DAY_OF_WEEK_OFFSET) };
    }
    case 'month': {
      // Từ ngày 1 đến ngày cuối của tháng chứa hôm nay (tháng 2 nhuận 29 ngày, tháng 30 hay 31 ngày)
      const first = monthStartOf(today);
      return { from: first, to: lastDayOfMonth(first) };
    }
    case 'range':
      return custom;
  }
}
