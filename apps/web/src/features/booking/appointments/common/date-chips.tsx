import type { DatePreset, DatePresetOption } from './date-presets';

// Các chip ngày của trang danh sách (booking F8 viết ở `reception/date-chips.tsx` theo Figma `479:2`, chuyển lên `common/` ở F11: Bác sĩ có sáu chip, Figma `457:2`): nhóm nút `aria-pressed` (không dùng
// `tablist`: không có `tabpanel`). Màu theo token (ADR 0004): nền chip đang chọn dùng `brand-strong` (chữ trắng 5,28:1) thay `#0092b8` của Figma (3,62:1). Tập chip, chữ và tên nhóm do nơi gọi truyền.
export function DateChips(props: {
  presets: readonly DatePresetOption[];
  groupLabel: string;
  selected: DatePreset;
  onSelect: (preset: DatePreset) => void;
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
            className={`inline-flex min-h-7 items-center rounded-lg border px-3 text-xs font-medium whitespace-nowrap ${
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
