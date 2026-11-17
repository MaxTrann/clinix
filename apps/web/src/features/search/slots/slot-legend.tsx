import { StatusIcon } from './slot-cell';
import {
  SLOT_LEGEND_LABEL,
  SLOT_LEGEND_ORDER,
  SLOT_STATUS_LABEL,
} from './slot-text';
import { CELL_TONE } from './slot-tone';

// Chú giải bốn trạng thái (Figma 446:367): ô 18,75 bo 7,375, nhãn 11 px. Cùng bảng màu với ô khung giờ nên hai nơi không lệch nhau.
export function SlotLegend() {
  return (
    <ul
      aria-label={SLOT_LEGEND_LABEL}
      className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] leading-[16.5px] text-gray-600"
    >
      {SLOT_LEGEND_ORDER.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`flex size-5 items-center justify-center rounded-[7.375px] border ${CELL_TONE[status]}`}
          >
            <StatusIcon status={status} className="size-3" />
          </span>
          {SLOT_STATUS_LABEL[status]}
        </li>
      ))}
    </ul>
  );
}
