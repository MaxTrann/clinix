import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Info } from 'lucide-react';
import { EmptyState } from '../../../shared/ui/empty-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  addDays,
  DAYS_IN_WEEK,
  formatWeekRange,
  todayVn,
  weekStartOf,
} from '../../../shared/schedule/week';
import {
  GRID_PAGE_SIZE,
  type ReceptionDoctorRow,
  type ReceptionShift,
} from '../api/reception-api';
import { STATUS_STYLES } from '../schedule/status-styles';
import { DayDrawer, ShiftDrawer } from './reception-drawers';
import {
  ALL,
  ReceptionToolbar,
  type ReceptionFilters,
} from './reception-filters';
import { ReceptionGrid } from './reception-grid';
import {
  describeReceptionError,
  NO_SCHEDULE_LABEL,
  READ_ONLY_NOTE,
  RECEPTION_STATUS_LABELS,
  RECEPTION_STATUS_ORDER,
  receptionStatusOf,
} from './reception-labels';
import {
  useReceptionBranchName,
  useReceptionDoctors,
  useReceptionGrid,
} from './use-reception-data';

const PAGE_BUTTON =
  'min-h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-white';

// Trang "Lịch làm việc bác sĩ" của Lễ tân (doctor F5; Figma `486:2`, `499:2`, `500:2`; WL-08, WL-09). CHỈ XEM: không có "+", Phân công hay Gỡ ca.
// Bác sĩ đang chọn nằm ở URL (`?bacSiId=`) để dán/chia sẻ được; id ngoài phạm vi làm server trả 403 và trang báo "không có quyền" (A2, Q13).
export function ReceptionSchedulePage() {
  const [today] = useState(() => todayVn());
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today));
  const [params, setParams] = useSearchParams();
  const [other, setOther] = useState<
    Pick<ReceptionFilters, 'chuyenKhoaId' | 'ca' | 'status'>
  >({ chuyenKhoaId: ALL, ca: ALL, status: ALL });
  const [page, setPage] = useState(1);
  const [shiftOpen, setShiftOpen] = useState<{
    doctor: ReceptionDoctorRow;
    shift: ReceptionShift;
  } | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const filters: ReceptionFilters = {
    ...other,
    bacSiId: params.get('bacSiId') ?? ALL,
  };
  const branchName = useReceptionBranchName();
  const doctors = useReceptionDoctors();
  const { state, retry } = useReceptionGrid({
    tuNgay: weekStart,
    denNgay: addDays(weekStart, DAYS_IN_WEEK - 1),
    page,
    bacSiId: filters.bacSiId === ALL ? undefined : filters.bacSiId,
    chuyenKhoaId:
      filters.chuyenKhoaId === ALL ? undefined : filters.chuyenKhoaId,
    ca: filters.ca === ALL ? undefined : filters.ca,
  });

  function changeFilters(next: ReceptionFilters) {
    const { bacSiId, ...rest } = next;
    setOther(rest);
    setPage(1);
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (bacSiId === ALL) copy.delete('bacSiId');
        else copy.set('bacSiId', bacSiId);
        return copy;
      },
      { replace: true },
    );
  }

  // Lọc trạng thái ở giao diện (Q15): mỗi bác sĩ chỉ giữ ca có trạng thái được chọn
  const rows = useMemo(() => {
    if (state.status !== 'success') return [];
    if (filters.status === ALL) return state.data.items;
    return state.data.items.map((doctor) => ({
      ...doctor,
      ca: doctor.ca.filter(
        (shift) => receptionStatusOf(shift.nghiPhep) === filters.status,
      ),
    }));
  }, [state, filters.status]);

  const total = state.status === 'success' ? state.data.total : 0;
  const pageCount = Math.max(1, Math.ceil(total / GRID_PAGE_SIZE));
  const failure =
    state.status === 'error' ? describeReceptionError(state.error) : null;

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          Lịch làm việc bác sĩ
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
          Chỉ xem
          {branchName !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-brand-strong">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-brand-strong"
              />
              {branchName}
            </span>
          )}
        </p>
      </header>

      <ReceptionToolbar
        filters={filters}
        onChange={changeFilters}
        doctors={doctors.state.status === 'success' ? doctors.state.data : []}
        weekLabel={formatWeekRange(weekStart)}
        onPreviousWeek={() => {
          setWeekStart((value) => addDays(value, -DAYS_IN_WEEK));
          setPage(1);
        }}
        onNextWeek={() => {
          setWeekStart((value) => addDays(value, DAYS_IN_WEEK));
          setPage(1);
        }}
        onToday={() => {
          setWeekStart(weekStartOf(today));
          setPage(1);
        }}
      />

      <ul
        aria-label="Chú giải"
        className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600"
      >
        {RECEPTION_STATUS_ORDER.map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full border ${STATUS_STYLES[status].dot}`}
            />
            {RECEPTION_STATUS_LABELS[status]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full border border-gray-300 bg-gray-100"
          />
          {NO_SCHEDULE_LABEL}
        </li>
      </ul>

      {state.status === 'loading' && (
        <LoadingState message="Đang tải lịch làm việc bác sĩ..." />
      )}
      {failure !== null && (
        <div
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
        >
          <p>{failure.message}</p>
          {failure.retryable && (
            <button
              type="button"
              className="mt-2 block font-medium underline"
              onClick={retry}
            >
              Thử lại
            </button>
          )}
        </div>
      )}
      {state.status === 'success' && rows.length === 0 && (
        <EmptyState message="Không có bác sĩ nào phù hợp với bộ lọc." />
      )}
      {state.status === 'success' && rows.length > 0 && (
        <ReceptionGrid
          weekStart={weekStart}
          today={today}
          rows={rows}
          triggerRef={triggerRef}
          onSelectShift={(doctor, shift) => setShiftOpen({ doctor, shift })}
          onSelectDay={setDayOpen}
        />
      )}
      {state.status === 'success' && pageCount > 1 && (
        <nav
          aria-label="Phân trang danh sách bác sĩ"
          className="flex items-center justify-end gap-3"
        >
          <button
            type="button"
            className={PAGE_BUTTON}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Trang trước
          </button>
          <span className="text-xs text-gray-600">
            Trang {page}/{pageCount}
          </span>
          <button
            type="button"
            className={PAGE_BUTTON}
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            Trang sau
          </button>
        </nav>
      )}

      <p className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-500">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        {READ_ONLY_NOTE}
      </p>

      {shiftOpen !== null && (
        <ShiftDrawer
          doctor={shiftOpen.doctor}
          shift={shiftOpen.shift}
          returnFocusRef={triggerRef}
          onClose={() => setShiftOpen(null)}
        />
      )}
      {dayOpen !== null && (
        <DayDrawer
          day={dayOpen}
          rows={rows}
          returnFocusRef={triggerRef}
          onClose={() => setDayOpen(null)}
        />
      )}
    </section>
  );
}
