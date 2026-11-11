import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  SHIFT_LABELS,
  SHIFT_ORDER,
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_ORDER,
} from '../../../shared/schedule/shift-labels';
import { ALL, type ScheduleFilters } from './schedule-filters';

export type ViewMode = 'week' | 'month';

export interface ScheduleToolbarProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  // "Tuần 12/10 – 18/10/2026" hoặc "Tháng 10 năm 2026"
  periodLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  todayDisabled: boolean;
  filters: ScheduleFilters;
  onFiltersChange: (filters: ScheduleFilters) => void;
  branches: readonly { chiNhanhId: string; ten: string }[];
}

const NAV_BUTTON =
  'inline-flex size-9 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100';
const SELECT =
  'min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 transition-colors hover:bg-gray-50';
const MODE_BUTTON =
  'min-h-9 px-4 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg';

// Thanh công cụ của lịch Bác sĩ (Figma `466:2`, `467:2`): chuyển kỳ, Tuần/Tháng, lọc trạng thái, lọc ca. "Hôm nay" và lọc chi nhánh không có trong
// Figma (L23 của PLAN, Q15): thêm theo WL-03, WL-05 [đề xuất]; lọc chi nhánh chỉ hiện khi Bác sĩ có ca ở từ hai chi nhánh (đã đổi chi nhánh công tác).
export function ScheduleToolbar({
  mode,
  onModeChange,
  periodLabel,
  onPrevious,
  onNext,
  onToday,
  todayDisabled,
  filters,
  onFiltersChange,
  branches,
}: ScheduleToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center rounded-lg border border-gray-200">
        <button
          type="button"
          aria-label={`${mode === 'week' ? 'Tuần' : 'Tháng'} trước`}
          className={NAV_BUTTON}
          onClick={onPrevious}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <p
          aria-live="polite"
          className="min-w-36 px-3 text-center text-sm font-semibold text-gray-900"
        >
          {periodLabel}
        </p>
        <button
          type="button"
          aria-label={`${mode === 'week' ? 'Tuần' : 'Tháng'} sau`}
          className={NAV_BUTTON}
          onClick={onNext}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div
        role="group"
        aria-label="Chế độ xem"
        className="flex rounded-lg border border-gray-200"
      >
        {(['week', 'month'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
            className={`${MODE_BUTTON} ${
              mode === value
                ? 'bg-brand-strong text-white'
                : 'bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            {value === 'week' ? 'Tuần' : 'Tháng'}
          </button>
        ))}
      </div>

      {/* "Hôm nay" không có trong Figma `466:2` (L20 của PLAN); thêm theo WL-03 [đề xuất] */}
      <button
        type="button"
        disabled={todayDisabled}
        onClick={onToday}
        className="min-h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:text-gray-500 disabled:hover:bg-white"
      >
        Hôm nay
      </button>

      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <select
          aria-label="Lọc theo trạng thái"
          className={SELECT}
          value={filters.status}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              status: event.target.value as ScheduleFilters['status'],
            })
          }
        >
          <option value={ALL}>Tất cả trạng thái</option>
          {SHIFT_STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {SHIFT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc theo ca"
          className={SELECT}
          value={filters.ca}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              ca: event.target.value as ScheduleFilters['ca'],
            })
          }
        >
          <option value={ALL}>Tất cả ca</option>
          {SHIFT_ORDER.map((ca) => (
            <option key={ca} value={ca}>
              {SHIFT_LABELS[ca]}
            </option>
          ))}
        </select>
        {branches.length >= 2 && (
          <select
            aria-label="Lọc theo chi nhánh"
            className={SELECT}
            value={filters.chiNhanhId}
            onChange={(event) =>
              onFiltersChange({ ...filters, chiNhanhId: event.target.value })
            }
          >
            <option value={ALL}>Tất cả chi nhánh</option>
            {branches.map((branch) => (
              <option key={branch.chiNhanhId} value={branch.chiNhanhId}>
                {branch.ten}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
