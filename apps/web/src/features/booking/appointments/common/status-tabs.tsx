import {
  APPOINTMENT_STATES,
  APPOINTMENT_STATE_LABELS,
  type AppointmentState,
} from './appointment-status';
import type { StatusCounts } from './status-counts';

export interface StatusTabsProps {
  counts: StatusCounts;
  selected: AppointmentState | null;
  onSelect: (status: AppointmentState | null) => void;
  // Các chip trạng thái theo thứ tự hiển thị (`Tất cả` luôn đứng đầu): mỗi trang chọn thứ tự của Figma của mình
  states: readonly AppointmentState[];
  groupLabel: string;
  allLabel: string;
}

// Thẻ lọc trạng thái có số đếm (booking F1 viết ở `patient/status-tabs.tsx` theo Figma `411:2`, chuyển lên `common/` ở F11: Bệnh nhân và Bác sĩ cùng dùng; Figma Bác sĩ `457:2`). Là nhóm nút
// `aria-pressed` chứ không phải `tablist`: không có `tabpanel` nào đổi theo thẻ, chỉ có bảng dưới lọc lại. Số đếm lấy từ `demTheoTrangThai` của API (áp mọi bộ lọc TRỪ trạng thái), KHÔNG đếm lại từ `items`.
function TabButton(props: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
}) {
  // Figma: thẻ chọn chữ cyan, gạch chân và số đếm nền cyan; chữ cyan và chữ trắng trên nền cyan đều dùng `brand-strong` 5,28:1 (ADR 0004)
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

export function StatusTabs(props: StatusTabsProps) {
  const { counts, selected, onSelect } = props;
  // B1, B5 không trả khoá tổng: `Tất cả` là tổng SÁU số, kể cả khi trang không vẽ đủ sáu chip. Đúng vì `demTheoTrangThai` áp mọi bộ lọc TRỪ `trangThai[]` và không có `DaDoiLich`;
  // khi đang chọn một chip thì `total` của danh sách khác tổng này, nên KHÔNG dùng `total`.
  const total = APPOINTMENT_STATES.reduce(
    (sum, state) => sum + counts[state],
    0,
  );
  return (
    <div
      role="group"
      aria-label={props.groupLabel}
      className="flex flex-wrap border-b border-gray-200"
    >
      <TabButton
        label={props.allLabel}
        count={total}
        pressed={selected === null}
        onClick={() => onSelect(null)}
      />
      {props.states.map((state) => (
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
