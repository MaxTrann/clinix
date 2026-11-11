import { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  LEAVE_PAGE_SIZE,
  type LeaveRequest,
  type LeaveStatus,
} from '../api/leave-api';
import { STATUS_STYLES } from '../schedule/status-styles';
import { LeaveDetailDialog } from './leave-detail-dialog';
import {
  formatLeaveDaysShort,
  formatLeaveKind,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_ORDER,
} from './leave-format';
import type { LeaveHistoryState } from './use-leave-history';

export interface LeaveHistoryProps {
  state: LeaveHistoryState;
  page: number;
  onPageChange: (page: number) => void;
  status: LeaveStatus | undefined;
  onStatusChange: (status: LeaveStatus | undefined) => void;
  onRetry: () => void;
}

const PAGE_BUTTON =
  'min-h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-white';

// Khối "Lịch sử yêu cầu nghỉ" (Figma `466:2`, `470:2`; WN-04, WN-07, WN-08): mỗi dòng "26/10 Theo ca · Ca sáng", lý do, chip trạng thái; bấm dòng mở chi tiết.
// Lọc theo trạng thái và phân trang là [đề xuất] (Figma chưa có; B12 hỗ trợ `trangThai`, `page`).
export function LeaveHistory({
  state,
  page,
  onPageChange,
  status,
  onStatusChange,
  onRetry,
}: LeaveHistoryProps) {
  const [selected, setSelected] = useState<LeaveRequest | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const data = state.status === 'success' ? state.data : null;
  const pageCount = data
    ? Math.max(1, Math.ceil(data.total / LEAVE_PAGE_SIZE))
    : 1;

  return (
    <section
      aria-label="Lịch sử yêu cầu nghỉ"
      className="rounded-xl border border-gray-200 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Lịch sử yêu cầu nghỉ
        </h2>
        <div className="flex items-center gap-3">
          <select
            aria-label="Lọc yêu cầu theo trạng thái"
            className="min-h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900"
            value={status ?? ''}
            onChange={(event) =>
              onStatusChange(
                (event.target.value || undefined) as LeaveStatus | undefined,
              )
            }
          >
            <option value="">Tất cả trạng thái</option>
            {LEAVE_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {LEAVE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          {data && (
            <span className="text-xs text-gray-500">{data.total} yêu cầu</span>
          )}
        </div>
      </div>

      <div className="px-5 py-3">
        {state.status === 'loading' && (
          <LoadingState message="Đang tải lịch sử yêu cầu nghỉ..." />
        )}
        {state.status === 'error' && (
          <ErrorState error={state.error} onRetry={onRetry} />
        )}
        {data && data.items.length === 0 && (
          <EmptyState
            message={
              status
                ? 'Không có yêu cầu nào ở trạng thái này.'
                : 'Chưa có yêu cầu nghỉ nào.'
            }
          />
        )}
        {data && data.items.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {data.items.map((request) => (
              <li key={request.yeuCauNghiPhepId}>
                <button
                  type="button"
                  onClick={(event) => {
                    triggerRef.current = event.currentTarget;
                    setSelected(request);
                  }}
                  className="flex w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatLeaveDaysShort(request)}
                      </span>
                      <span className="text-xs text-gray-600">
                        {formatLeaveKind(request)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-600">
                      {request.lyDo}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[request.trangThai].chip}`}
                    >
                      {LEAVE_STATUS_LABELS[request.trangThai]}
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 text-gray-400"
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {data && pageCount > 1 && (
          <nav
            aria-label="Phân trang lịch sử yêu cầu nghỉ"
            className="mt-2 flex items-center justify-end gap-3 border-t border-gray-100 pt-3"
          >
            <button
              type="button"
              className={PAGE_BUTTON}
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
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
              onClick={() => onPageChange(page + 1)}
            >
              Trang sau
            </button>
          </nav>
        )}
      </div>

      {selected !== null && (
        <LeaveDetailDialog
          request={selected}
          returnFocusRef={triggerRef}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
