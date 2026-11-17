import type { ReactNode } from 'react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import type { DoctorItem, Paged } from '../api/search-types';
import type { RemoteState } from '../../../shared/hooks/use-remote';
import { DoctorSlotPanel } from '../slots/doctor-slot-panel';
import { dateLabel } from '../slots/slot-dates';
import { BOOKING_PICK_SLOT_HINT } from '../slots/slot-text';
import { useDoctorSlots } from '../slots/use-doctor-slots';
import type { SlotDate } from '../slots/use-slot-date';
import { DoctorCard } from './doctor-card';

export const DOCTOR_EMPTY_MESSAGE = 'Không tìm thấy bác sĩ phù hợp';
export const DOCTOR_EMPTY_HINT = 'Hãy đổi bộ lọc để xem thêm bác sĩ.';
export const DOCTOR_EMPTY_HINT_WITH_SERVICE =
  'Hãy đổi bộ lọc hoặc chọn dịch vụ khác.';

// Trang nào đang dùng danh sách: chuyên khoa và Đội ngũ bác sĩ (thẻ có tiêu đề "Lịch khám …"), Bước 3 đặt lịch (chỉ lưới); Đội ngũ bác sĩ còn thêm "· lịch Hôm nay" ở dòng đếm
export type ResultsVariant = 'specialty' | 'team' | 'booking';

interface DoctorResultsProps {
  state: RemoteState<Paged<DoctorItem>>;
  retry: () => void;
  page: number;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  // Gợi ý thêm khi rỗng (F5: liên kết "Chọn dịch vụ khác")
  emptyAction?: ReactNode;
  emptyHint?: string;
  // Ngày đang xem và kiểu đặt lưới khung giờ trong thẻ (search PR-C2)
  slotDate: SlotDate;
  variant: ResultsVariant;
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
  slotDate,
  variant,
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
      <p className="mb-4 text-sm text-gray-600">
        {total} bác sĩ
        {variant === 'team' &&
          ` · lịch ${dateLabel(slotDate.date, slotDate.today)}`}
      </p>
      <DoctorList items={items} slotDate={slotDate} variant={variant} />
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
      {variant === 'booking' && (
        <p className="mt-5 text-center text-[15px] text-gray-500">
          {BOOKING_PICK_SLOT_HINT}
        </p>
      )}
    </div>
  );
}

// Danh sách thẻ + MỘT lời gọi khung giờ cho cả trang (T4). Chỉ được gắn khi đã có danh sách nên không gọi lúc đang tải, lỗi hay rỗng.
function DoctorList({
  items,
  slotDate,
  variant,
}: {
  items: DoctorItem[];
  slotDate: SlotDate;
  variant: ResultsVariant;
}) {
  const slots = useDoctorSlots(
    items.map((doctor) => doctor.bacSiId),
    slotDate.date,
  );
  return (
    <ul className="flex flex-col gap-5">
      {items.map((doctor) => (
        <DoctorCard
          key={doctor.bacSiId}
          doctor={doctor}
          schedule={
            <DoctorSlotPanel
              bacSiId={doctor.bacSiId}
              slots={slots.state}
              retry={slots.retry}
              slotDate={slotDate}
              variant={variant === 'booking' ? 'booking' : 'listing'}
            />
          }
        />
      ))}
    </ul>
  );
}
