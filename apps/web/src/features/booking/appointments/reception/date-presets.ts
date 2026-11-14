import type { DatePresetOption } from '../common/date-presets';

// Chip ngày của "Quản lý lịch hẹn" (Figma `479:2`: `Hôm nay`, `Ngày mai`, `Tuần này`, `Khoảng ngày`; PLAN Q32). Hàm tính khoảng ngày (`presetRange`) và kiểu `DatePreset` đã chuyển lên
// `common/date-presets.ts` ở F11 (Bác sĩ có thêm `Tuần sau`, `Tháng này`); xuất lại tên cũ cho chỗ dùng và test của F8. Ở đây còn tập bốn chip và chữ của Lễ tân.
export { presetRange, type DatePreset } from '../common/date-presets';

// Thứ tự và chữ của Figma `479:2`
export const DATE_PRESETS: readonly DatePresetOption[] = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'tomorrow', label: 'Ngày mai' },
  { id: 'week', label: 'Tuần này' },
  { id: 'range', label: 'Khoảng ngày' },
];
