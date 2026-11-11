import { useCallback, useMemo, useRef, useState } from 'react';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  addMonths,
  formatMonthLabel,
  isInMonth,
  monthGrid,
  monthStartOf,
} from '../../../shared/schedule/month';
import {
  addDays,
  DAYS_IN_WEEK,
  formatWeekRange,
  todayVn,
  weekStartOf,
} from '../../../shared/schedule/week';
import type { LeaveStatus } from '../api/leave-api';
import type { DoctorShift } from '../api/schedule-api';
import { LeaveHistory } from '../leave/leave-history';
import { LeaveRequestDialog } from '../leave/leave-request-dialog';
import { LEAVE_CREATED_MESSAGE, LeaveToast } from '../leave/leave-toast';
import { useLeaveHistory } from '../leave/use-leave-history';
import { MonthGrid } from './month-grid';
import {
  ALL,
  applyFilters,
  hasActiveFilters,
  NO_FILTERS,
  type ScheduleFilters,
} from './schedule-filters';
import { ScheduleSummary } from './schedule-summary';
import { ScheduleToolbar, type ViewMode } from './schedule-toolbar';
import { ShiftDetailDialog } from './shift-detail-dialog';
import { useSchedule } from './use-schedule';
import { countWeek } from './week-counts';
import { WeekGrid } from './week-grid';

// Khoảng ngày cần tải cho kỳ đang xem: tuần = T2–CN; tháng = cả lưới (T2 đầu lưới … CN cuối lưới, ≤ 42 ngày)
function rangeOf(mode: ViewMode, anchor: string) {
  if (mode === 'week') {
    const start = weekStartOf(anchor);
    return { start, end: addDays(start, DAYS_IN_WEEK - 1) };
  }
  const { gridStart, gridEnd } = monthGrid(monthStartOf(anchor));
  return { start: gridStart, end: gridEnd };
}

// Trang "Lịch làm việc" của Bác sĩ: tuần (doctor F2; Figma `466:2`, `469:2`), tháng + bộ lọc (doctor F3; Figma `467:2`), nút "Yêu cầu nghỉ" và
// "Lịch sử yêu cầu nghỉ" (doctor F4; Figma `468:2`, `470:2`, `471:2`). Ngày hiện tại, đầu tuần, đầu tháng tính theo giờ Việt Nam (WL-03, WL-11).
export function DoctorSchedulePage() {
  const [today] = useState(() => todayVn());
  const [mode, setMode] = useState<ViewMode>('week');
  // Một ngày bất kỳ trong kỳ đang xem; đổi chế độ giữ nguyên ngày này nên Tuần ⇄ Tháng không nhảy lung tung
  const [anchor, setAnchor] = useState(today);
  const [filters, setFilters] = useState<ScheduleFilters>(NO_FILTERS);
  const [selected, setSelected] = useState<DoctorShift | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // F4: hộp gửi yêu cầu nghỉ, thông báo thành công, lịch sử (trang + lọc trạng thái)
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatus, setHistoryStatus] = useState<LeaveStatus | undefined>();
  const leaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const history = useLeaveHistory(historyPage, historyStatus);
  const dismissToast = useCallback(() => setToast(null), []);

  const range = rangeOf(mode, anchor);
  const monthStart = monthStartOf(anchor);
  const { state, retry } = useSchedule(range.start, range.end);
  const { reload: reloadHistory } = history;

  const data = state.status === 'success' ? state.data : null;
  const branchOptions = useMemo(() => data?.chiNhanhLoc ?? [], [data]);
  // Chi nhánh đang lọc có thể không còn ở kỳ mới (Bác sĩ đã đổi chi nhánh): coi như "Tất cả" thay vì hiện lưới trống khó hiểu
  const effectiveFilters = useMemo<ScheduleFilters>(
    () =>
      filters.chiNhanhId === ALL ||
      branchOptions.some((b) => b.chiNhanhId === filters.chiNhanhId)
        ? filters
        : { ...filters, chiNhanhId: ALL },
    [filters, branchOptions],
  );

  // Ca của kỳ đang xem: tháng chỉ tính ngày thuộc tháng (lưới tải thêm ngày của tháng liền kề để đủ tuần)
  const periodShifts = useMemo(
    () =>
      (data?.ca ?? []).filter(
        (shift) => mode === 'week' || isInMonth(shift.ngay, monthStart),
      ),
    [data, mode, monthStart],
  );
  const shown = useMemo(
    () => applyFilters(periodShifts, effectiveFilters),
    [periodShifts, effectiveFilters],
  );

  const periodLabel =
    mode === 'week'
      ? `Tuần ${formatWeekRange(range.start)}`
      : formatMonthLabel(monthStart);
  const containsToday =
    mode === 'week'
      ? range.start === weekStartOf(today)
      : monthStart === monthStartOf(today);
  const step = (direction: 1 | -1) =>
    setAnchor((value) =>
      mode === 'week'
        ? addDays(value, direction * DAYS_IN_WEEK)
        : addMonths(monthStartOf(value), direction),
    );
  const branches = branchOptions.map((branch) => branch.ten).join(', ');

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
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
        </div>
        <button
          ref={leaveButtonRef}
          type="button"
          onClick={() => setLeaveOpen(true)}
          className="min-h-11 rounded-lg bg-brand-strong px-5 text-sm font-semibold text-white transition-colors hover:bg-cyan-800"
        >
          Yêu cầu nghỉ
        </button>
      </header>

      <ScheduleToolbar
        mode={mode}
        onModeChange={setMode}
        periodLabel={periodLabel}
        onPrevious={() => step(-1)}
        onNext={() => step(1)}
        onToday={() => setAnchor(today)}
        todayDisabled={containsToday}
        filters={effectiveFilters}
        onFiltersChange={setFilters}
        branches={branchOptions}
      />

      {state.status === 'loading' && (
        <LoadingState message="Đang tải lịch làm việc..." />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={retry} />
      )}
      {state.status === 'success' && (
        <>
          <ScheduleSummary counts={countWeek(shown)} />
          {periodShifts.length === 0 && (
            <EmptyState
              message={
                mode === 'week'
                  ? 'Tuần này bạn chưa có ca làm việc nào.'
                  : 'Tháng này bạn chưa có ca làm việc nào.'
              }
            />
          )}
          {periodShifts.length > 0 &&
            shown.length === 0 &&
            hasActiveFilters(effectiveFilters) && (
              <EmptyState message="Không có ca nào khớp với bộ lọc." />
            )}
          {mode === 'week' ? (
            <WeekGrid
              weekStart={range.start}
              today={today}
              shifts={shown}
              triggerRef={triggerRef}
              onSelect={setSelected}
            />
          ) : (
            <MonthGrid
              monthStart={monthStart}
              today={today}
              shifts={shown}
              triggerRef={triggerRef}
              onSelect={setSelected}
            />
          )}
        </>
      )}

      <LeaveHistory
        state={history.state}
        page={historyPage}
        onPageChange={setHistoryPage}
        status={historyStatus}
        onStatusChange={(value) => {
          setHistoryStatus(value);
          setHistoryPage(1);
        }}
        onRetry={reloadHistory}
      />

      {leaveOpen && (
        <LeaveRequestDialog
          returnFocusRef={leaveButtonRef}
          onClose={() => setLeaveOpen(false)}
          onCreated={() => {
            setLeaveOpen(false);
            setToast(LEAVE_CREATED_MESSAGE);
            // Yêu cầu mới nhất ở trang đầu; lịch tải lại để ô nghỉ hiện "Chờ duyệt"
            setHistoryPage(1);
            setHistoryStatus(undefined);
            reloadHistory();
            retry();
          }}
        />
      )}
      {toast !== null && (
        <LeaveToast message={toast} onDismiss={dismissToast} />
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
