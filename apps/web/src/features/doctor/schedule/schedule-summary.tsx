import {
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_ORDER,
} from '../../../shared/schedule/shift-labels';
import type { WeekCounts } from './week-counts';
import { STATUS_STYLES } from './status-styles';

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="px-5 first:pl-0">
      <p className={`text-2xl leading-none font-bold ${tone}`}>{value}</p>
      <p className="mt-1.5 text-xs text-gray-600">{label}</p>
    </div>
  );
}

// Khối thống kê + chú giải (Figma `466:2`). Màu số: xanh thương hiệu, đỏ, cam như Figma, bậc đậm để đủ tương phản.
export function ScheduleSummary({ counts }: { counts: WeekCounts }) {
  return (
    <section
      aria-label="Thống kê tuần"
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4"
    >
      <div className="flex divide-x divide-gray-200">
        <Stat
          value={counts.working}
          label="Ca làm việc"
          tone="text-brand-strong"
        />
        <Stat
          value={counts.approvedLeave}
          label="Nghỉ đã duyệt"
          tone="text-danger-strong"
        />
        <Stat
          value={counts.pendingLeave}
          label="Chờ duyệt"
          tone="text-warning"
        />
      </div>
      <ul
        aria-label="Chú giải"
        className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-gray-600"
      >
        {SHIFT_STATUS_ORDER.map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-3 rounded-full border ${STATUS_STYLES[status].dot}`}
            />
            {SHIFT_STATUS_LABELS[status]}
          </li>
        ))}
      </ul>
    </section>
  );
}
