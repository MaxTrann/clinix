import { addDays, weekStartOf } from '../../../../shared/schedule/week';
import type { DateRange } from '../common/date-range';

// Chip ngày của "Quản lý lịch hẹn" (Figma `479:2`: `Hôm nay`, `Ngày mai`, `Tuần này`, `Khoảng ngày`; PLAN Q32: là hai tham số `tuNgay`, `denNgay` do FE tính theo giờ
// Việt Nam). Hàm thuần: `today` là ngày Việt Nam `YYYY-MM-DD` do nơi gọi lấy từ `todayVn()` (test truyền ngày cố định hay đồng hồ giả), nên không có chỗ nào ở đây
// đọc đồng hồ hay múi giờ của máy. Cộng ngày làm ở UTC trên ba số năm-tháng-ngày (`shared/schedule/week.ts`): qua tháng, qua năm, năm nhuận đều đúng.
export type DatePreset = 'today' | 'tomorrow' | 'week' | 'range';

// Thứ tự và chữ của Figma `479:2`
export const DATE_PRESETS: readonly { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'tomorrow', label: 'Ngày mai' },
  { id: 'week', label: 'Tuần này' },
  { id: 'range', label: 'Khoảng ngày' },
];

// Số ngày của một tuần T2 đến CN; `Tuần này` là thứ Hai đến Chủ nhật của tuần chứa hôm nay (Chủ nhật thuộc tuần TRƯỚC thứ Hai kế tiếp, như lịch Việt Nam và `weekStartOf`)
const LAST_DAY_OF_WEEK_OFFSET = 6;

// Khoảng ngày gửi lên API cho chip đang chọn. `Khoảng ngày` dùng khoảng người dùng đã nhập (`custom`; ô trống thì không ràng buộc đầu đó, cả hai trống là mọi ngày).
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
    case 'range':
      return custom;
  }
}
