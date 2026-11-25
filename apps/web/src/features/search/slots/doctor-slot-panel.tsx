import type { RemoteState } from '../../../shared/hooks/use-remote';
import type { DoctorSlotsById, PublicSlot } from '../api/slot-types';
import { DoctorSlotGrid } from './doctor-slot-grid';
import { dateLabel } from './slot-dates';
import {
  LISTING_SLOT_NOTE,
  SLOTS_LOADING,
  SLOTS_LOAD_ERROR,
  SLOTS_RETRY,
  SLOT_DATE_BACK_TO_TODAY,
  SLOT_DATE_INVALID,
} from './slot-text';
import type { SlotDate } from './use-slot-date';
import { isSlotDateError } from './use-doctor-slots';

// Hai kiểu đặt: `listing` (chuyên khoa, Đội ngũ bác sĩ: Figma 259:2, 260:2) có tiêu đề "Lịch khám …" và dòng "chưa giữ chỗ" ở từng thẻ;
// `booking` (Bước 3: Figma 446:2) chỉ có lưới, ý "chưa giữ chỗ" nằm ở banner đầu trang.
export type SlotPanelVariant = 'listing' | 'booking';

interface DoctorSlotPanelProps {
  bacSiId: string;
  slots: RemoteState<DoctorSlotsById>;
  retry: () => void;
  slotDate: Pick<SlotDate, 'date' | 'today' | 'resetToToday'>;
  variant: SlotPanelVariant;
  // reschedule F1, TUỲ CHỌN: chuyển xuống lưới để ô `ConTrong` thành nút chọn (xem `SlotCell`); vắng ⇒ liên kết như trước
  onSelect?: (slot: PublicSlot) => void;
}

const BUTTON =
  'mt-2 inline-flex min-h-10 items-center rounded-[0.625rem] border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50';

// Khung chờ cùng cỡ với lưới điển hình (sáu ô) để thẻ không nhảy bố cục khi dữ liệu về
function SlotsSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">{SLOTS_LOADING}</p>
      <div aria-hidden="true" className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-[46px] animate-pulse rounded-[13.375px] bg-gray-200 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

// Lỗi của lưới giờ KHÔNG làm hỏng danh sách bác sĩ: thẻ vẫn hiện, chỉ phần lịch báo lỗi riêng
function SlotsError({
  error,
  retry,
  resetToToday,
}: {
  error: unknown;
  retry: () => void;
  resetToToday: () => void;
}) {
  const dateProblem = isSlotDateError(error);
  return (
    <div className="py-3">
      <p className="text-sm text-gray-700">
        {dateProblem ? SLOT_DATE_INVALID : SLOTS_LOAD_ERROR}
      </p>
      <button
        type="button"
        onClick={dateProblem ? resetToToday : retry}
        className={BUTTON}
      >
        {dateProblem ? SLOT_DATE_BACK_TO_TODAY : SLOTS_RETRY}
      </button>
    </div>
  );
}

export function DoctorSlotPanel({
  bacSiId,
  slots,
  retry,
  slotDate,
  variant,
  onSelect,
}: DoctorSlotPanelProps) {
  const listing = variant === 'listing';
  const day = slots.status === 'ready' ? slots.data.get(bacSiId) : undefined;
  return (
    <div>
      {listing && (
        <p className="text-sm text-gray-500">
          Lịch khám{' '}
          <strong className="text-gray-900">
            {dateLabel(slotDate.date, slotDate.today)}
          </strong>
        </p>
      )}
      <div className={listing ? 'mt-3' : ''}>
        {slots.status === 'loading' && <SlotsSkeleton />}
        {slots.status === 'error' && (
          <SlotsError
            error={slots.error}
            retry={retry}
            resetToToday={slotDate.resetToToday}
          />
        )}
        {/* Bộ đọc đã bảo đảm có đủ phần tử cho mọi id đã hỏi; thiếu thì coi như lỗi tải */}
        {slots.status === 'ready' &&
          (day ? (
            <DoctorSlotGrid day={day} onSelect={onSelect} />
          ) : (
            <SlotsError
              error={null}
              retry={retry}
              resetToToday={slotDate.resetToToday}
            />
          ))}
      </div>
      {listing && (
        <p className="mt-3 text-[11px] leading-[16.5px] text-gray-500">
          {LISTING_SLOT_NOTE}
        </p>
      )}
    </div>
  );
}
