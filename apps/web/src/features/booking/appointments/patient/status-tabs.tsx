import {
  APPOINTMENT_STATES,
  APPOINTMENT_STATE_LABELS,
  type AppointmentState,
} from '../common/appointment-status';
import type { StatusCounts } from './api/patient-appointment-types';
import { LIST_TEXT } from './list-messages';

interface StatusTabsProps {
  counts: StatusCounts;
  selected: AppointmentState | null;
  onSelect: (status: AppointmentState | null) => void;
}

// Thẻ lọc trạng thái có số đếm (Figma `411:2`). Là nhóm nút `aria-pressed` chứ không phải `tablist`: không có `tabpanel` nào đổi theo thẻ, chỉ có
// bảng dưới lọc lại. Số đếm lấy từ `demTheoTrangThai` của API (áp mọi bộ lọc TRỪ trạng thái), KHÔNG đếm lại từ `items`.
function TabButton(props: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
}) {
  // Figma `411:2`: thẻ chọn chữ cyan, gạch chân và số đếm nền cyan; chữ cyan và chữ trắng trên nền cyan đều dùng `brand-strong` 5,28:1 (ADR 0004)
  const tone = props.pressed
    ? 'border-brand-strong text-brand-strong'
    : 'border-transparent text-gray-700 hover:text-gray-900';
  const badge = props.pressed
    ? 'bg-brand-strong text-white'
    : 'bg-gray-100 text-gray-700';
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      onClick={props.onClick}
      className={`-mb-px inline-flex min-h-[2.4rem] items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap ${tone}`}
    >
      {props.label}{' '}
      <span
        className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-xs ${badge}`}
      >
        {props.count}
      </span>
    </button>
  );
}

export function StatusTabs({ counts, selected, onSelect }: StatusTabsProps) {
  // B1 không trả khoá tổng: `Tất cả` là tổng sáu số. Đúng vì `demTheoTrangThai` áp mọi bộ lọc TRỪ `trangThai[]` và không có `DaDoiLich`.
  const total = APPOINTMENT_STATES.reduce(
    (sum, state) => sum + counts[state],
    0,
  );
  return (
    <div
      role="group"
      aria-label={LIST_TEXT.statusGroup}
      className="flex flex-wrap border-b border-gray-200"
    >
      <TabButton
        label={LIST_TEXT.allStatuses}
        count={total}
        pressed={selected === null}
        onClick={() => onSelect(null)}
      />
      {APPOINTMENT_STATES.map((state) => (
        <TabButton
          key={state}
          label={APPOINTMENT_STATE_LABELS[state]}
          count={counts[state]}
          pressed={selected === state}
          onClick={() => onSelect(state)}
        />
      ))}
    </div>
  );
}
