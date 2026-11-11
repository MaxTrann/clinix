import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  addDays,
  DAYS_IN_WEEK,
  formatWeekRange,
  todayVn,
  weekStartOf,
} from '../../../shared/schedule/week';
import type { DoctorShift } from '../api/schedule-api';
import { ScheduleSummary } from './schedule-summary';
import { ShiftDetailDialog } from './shift-detail-dialog';
import { useWeekSchedule } from './use-week-schedule';
import { countWeek } from './week-counts';
import { WeekGrid } from './week-grid';

const NAV_BUTTON =
  'inline-flex size-9 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100';

// Trang "Lịch làm việc" của Bác sĩ, chế độ tuần (doctor F2; Figma `466:2`, `469:2`). Chế độ tháng, lọc, "Yêu cầu nghỉ" và lịch sử yêu cầu
// là F3, F4. Ngày hiện tại và đầu tuần tính theo giờ Việt Nam (WL-03, WL-11).
export function DoctorSchedulePage() {
  const [today] = useState(() => todayVn());
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today));
  const [selected, setSelected] = useState<DoctorShift | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const { state, retry } = useWeekSchedule(weekStart);

  const branches =
    state.status === 'success'
      ? state.data.chiNhanhLoc.map((branch) => branch.ten).join(', ')
      : '';
  const isCurrentWeek = weekStart === weekStartOf(today);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">Lịch làm việc</h1>
        <p className="text-sm text-gray-600">
          Theo dõi ca làm việc, trạng thái phân công và quản lý yêu cầu nghỉ.
        </p>
        {branches !== '' && (
          <p className="text-sm text-gray-600">
            Chi nhánh công tác:{' '}
            <span className="font-medium text-gray-900">{branches}</span>
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center rounded-lg border border-gray-200">
          <button
            type="button"
            aria-label="Tuần trước"
            className={NAV_BUTTON}
            onClick={() =>
              setWeekStart((value) => addDays(value, -DAYS_IN_WEEK))
            }
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <p
            aria-live="polite"
            className="px-3 text-sm font-semibold text-gray-900"
          >
            Tuần {formatWeekRange(weekStart)}
          </p>
          <button
            type="button"
            aria-label="Tuần sau"
            className={NAV_BUTTON}
            onClick={() =>
              setWeekStart((value) => addDays(value, DAYS_IN_WEEK))
            }
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
        {/* "Hôm nay" không có trong Figma `466:2` (L20 của PLAN); thêm theo WL-03 [đề xuất] */}
        <button
          type="button"
          disabled={isCurrentWeek}
          onClick={() => setWeekStart(weekStartOf(today))}
          className="min-h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:text-gray-500 disabled:hover:bg-white"
        >
          Hôm nay
        </button>
      </div>

      {state.status === 'loading' && (
        <LoadingState message="Đang tải lịch làm việc..." />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={retry} />
      )}
      {state.status === 'success' && (
        <>
          <ScheduleSummary counts={countWeek(state.data.ca)} />
          {state.data.ca.length === 0 && (
            <EmptyState message="Tuần này bạn chưa có ca làm việc nào." />
          )}
          <WeekGrid
            weekStart={weekStart}
            today={today}
            shifts={state.data.ca}
            triggerRef={triggerRef}
            onSelect={setSelected}
          />
        </>
      )}

      {selected !== null && (
        <ShiftDetailDialog
          shift={selected}
          returnFocusRef={triggerRef}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
