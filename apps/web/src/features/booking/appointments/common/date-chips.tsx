import type { DatePreset, DatePresetOption } from './date-presets';

// Các chip ngày của trang danh sách (booking F8 viết ở `reception/date-chips.tsx` theo Figma `479:2`, chuyển lên `common/` ở F11: Bác sĩ có sáu chip, Figma `457:2`): nhóm nút `aria-pressed` (không dùng
// `tablist`: không có `tabpanel`). Màu theo token (ADR 0004): nền chip đang chọn dùng `brand-strong` (chữ trắng 5,28:1) thay `#0092b8` của Figma (3,62:1). Tập chip, chữ và tên nhóm do nơi gọi truyền.
// F12b (UI-10): chiều cao chip theo Figma của TỪNG màn: Bác sĩ `457:134` 30 px (`min-h-8`, mặc định); Lễ tân `494:178` 27,9 px (`min-h-7.5` = 28,1 px, Lễ tân truyền riêng). Gốc `html` là 15 px nên `rem` tính theo 15, không phải 16.
export function DateChips(props: {
  presets: readonly DatePresetOption[];
  groupLabel: string;
  selected: DatePreset;
  onSelect: (preset: DatePreset) => void;
  // Lớp chiều cao tối thiểu của chip; vắng thì `min-h-8` (30 px, Bác sĩ)
  height?: string;
}) {
  return (
    <div
      role="group"
      aria-label={props.groupLabel}
      className="flex flex-wrap items-center gap-1.5"
    >
      {props.presets.map((preset) => {
        const pressed = preset.id === props.selected;
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={pressed}
            onClick={() => props.onSelect(preset.id)}
            className={`inline-flex ${props.height ?? 'min-h-8'} items-center rounded-lg border px-3 text-xs font-medium whitespace-nowrap ${
              pressed
                ? 'border-brand-strong bg-brand-strong text-white'
                : 'border-gray-500 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
