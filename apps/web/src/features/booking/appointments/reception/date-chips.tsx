import { DateChips as CommonDateChips } from '../common/date-chips';
import { DATE_PRESETS, type DatePreset } from './date-presets';
import { LIST_TEXT } from './list-messages';

// Bốn chip ngày của Figma `479:2`: lớp mỏng trên `common/date-chips.tsx` (chuyển lên ở F11, Bác sĩ dùng chung với sáu chip); giữ tên và props cũ để chỗ dùng không đổi.
// Chip `Khoảng ngày` được tô khi đang chọn (Figma `494:2` không tô: lệch Figma, `[đề xuất]`).
export function DateChips(props: {
  selected: DatePreset;
  onSelect: (preset: DatePreset) => void;
}) {
  return (
    <CommonDateChips
      {...props}
      presets={DATE_PRESETS}
      groupLabel={LIST_TEXT.dateGroup}
    />
  );
}
