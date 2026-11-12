import { DATE_PRESETS, type DatePreset } from './date-presets';
import { LIST_TEXT } from './list-messages';

// Bốn chip ngày của Figma `479:2`: nhóm nút `aria-pressed` (không dùng `tablist`: không có `tabpanel`). Màu theo token (ADR 0004): nền chip đang chọn dùng `brand-strong`
// (chữ trắng 5,28:1) thay `#0092b8` của Figma (3,62:1). Chip `Khoảng ngày` được tô khi đang chọn (Figma `494:2` không tô: lệch Figma, `[đề xuất]`).
export function DateChips(props: {
  selected: DatePreset;
  onSelect: (preset: DatePreset) => void;
}) {
  return (
    <div
      role="group"
      aria-label={LIST_TEXT.dateGroup}
      className="flex flex-wrap items-center gap-1.5"
    >
      {DATE_PRESETS.map((preset) => {
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
