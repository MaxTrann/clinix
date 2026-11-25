import type { PublicSlot } from '../api/slot-types';
import { DateStrip } from './date-strip';
import { DoctorSlotPanel } from './doctor-slot-panel';
import { dateAccessibleName } from './slot-dates';
import { useDoctorSlots } from './use-doctor-slots';
import { useSlotDate } from './use-slot-date';

interface SlotPickerProps {
  bacSiId: string;
  // Gọi khi bấm một ô `ConTrong` (ô khác không bấm được); nhận nguyên ô của máy chủ, id là chuỗi
  onSelect: (slot: PublicSlot) => void;
}

/**
 * Bộ chọn khung giờ dùng chung (reschedule F1; F3, F4 dùng lại): dải bảy ngày + lưới khung giờ của ĐÚNG MỘT bác sĩ, ô `ConTrong` là nút gọi `onSelect`.
 * Ghép từ các mảnh có sẵn của search (`useSlotDate`, `useDoctorSlots`, `DateStrip`, `DoctorSlotPanel` kiểu `booking`): trạng thái ô, hết hạn, nghỉ phép do MÁY CHỦ tính,
 * ở đây không tự quyết ô nào chọn được. Ngày chỉ nằm trong state (không lên URL, không ghi storage). Đổi ngày thì thẻ ngày giữ tiêu điểm (thẻ không bị dựng lại)
 * và dòng `role="status"` ẩn trực quan báo ngày đang xem.
 */
export function SlotPicker({ bacSiId, onSelect }: SlotPickerProps) {
  const slotDate = useSlotDate();
  const { state, retry } = useDoctorSlots([bacSiId], slotDate.date);
  return (
    <div>
      <DateStrip
        dates={slotDate.dates}
        value={slotDate.date}
        today={slotDate.today}
        onChange={slotDate.setDate}
      />
      <p role="status" className="sr-only">
        Đang xem {dateAccessibleName(slotDate.date, slotDate.today)}.
      </p>
      <div className="mt-4">
        <DoctorSlotPanel
          bacSiId={bacSiId}
          slots={state}
          retry={retry}
          slotDate={slotDate}
          variant="booking"
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
