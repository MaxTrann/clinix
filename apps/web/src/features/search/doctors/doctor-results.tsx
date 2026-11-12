import type { ReactNode } from 'react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import type { DoctorItem, Paged } from '../api/search-types';
import type { RemoteState } from '../../../shared/hooks/use-remote';
import { DoctorCard } from './doctor-card';

export const DOCTOR_EMPTY_MESSAGE = 'Không tìm thấy bác sĩ phù hợp';
export const DOCTOR_EMPTY_HINT = 'Hãy đổi bộ lọc để xem thêm bác sĩ.';
export const DOCTOR_EMPTY_HINT_WITH_SERVICE =
  'Hãy đổi bộ lọc hoặc chọn dịch vụ khác.';

interface DoctorResultsProps {
  state: RemoteState<Paged<DoctorItem>>;
  retry: () => void;
  page: number;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  // Gợi ý thêm khi rỗng (F5: liên kết "Chọn dịch vụ khác")
  emptyAction?: ReactNode;
  emptyHint?: string;
}

// Kết quả danh sách bác sĩ: đang tải / lỗi (có "Thử lại") / rỗng (A1) / danh sách + phân trang. Bộ lọc đứng ngoài nên không mất khi lỗi (TBS-22).
export function DoctorResults({
  state,
  retry,
  page,
  onPageChange,
  onResetFilters,
  emptyAction,
  emptyHint = DOCTOR_EMPTY_HINT,
}: DoctorResultsProps) {
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') {
    return <ErrorState error={state.error} onRetry={retry} />;
  }
  const { items, total, pageSize } = state.data;
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 p-5 text-center">
        <p className="font-medium text-gray-900">{DOCTOR_EMPTY_MESSAGE}</p>
        <p className="mt-1 text-sm text-gray-600">{emptyHint}</p>
        <div className="mt-3 flex items-center justify-center gap-4 text-sm font-medium">
          <button type="button" onClick={onResetFilters} className="underline">
            Xoá bộ lọc
          </button>
          {emptyAction}
        </div>
      </div>
    );
  }
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div>
      <p className="mb-3 text-sm text-gray-600">{total} bác sĩ</p>
      <ul className="flex flex-col gap-4">
        {items.map((doctor) => (
          <DoctorCard key={doctor.bacSiId} doctor={doctor} />
        ))}
      </ul>
      {lastPage > 1 && (
        <nav
          aria-label="Phân trang"
          className="mt-5 flex items-center justify-center gap-4 text-sm"
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:text-gray-400"
          >
            Trang trước
          </button>
          <span>
            Trang {page}/{lastPage}
          </span>
          <button
            type="button"
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:text-gray-400"
          >
            Trang sau
          </button>
        </nav>
      )}
    </div>
  );
}
