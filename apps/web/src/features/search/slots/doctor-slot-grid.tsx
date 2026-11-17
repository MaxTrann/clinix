import type { DoctorDaySlots, PublicSlot, SlotShift } from '../api/slot-types';
import { SlotCell } from './slot-cell';
import { SlotDayNotice } from './slot-day-notice';
import { SlotLegend } from './slot-legend';
import {
  NO_SLOTS_LEFT,
  SHIFT_LABEL,
  SLOT_COUNT_REST,
  slotDayNoticeTitle,
} from './slot-text';

const SHIFT_ORDER: readonly SlotShift[] = ['CaSang', 'CaChieu', 'CaToi'];

// Nhóm theo `ca` của máy chủ (KHÔNG suy từ giờ: ô 11:30 của ca chiều vẫn ở "Buổi chiều"), trong nhóm sắp theo giờ bắt đầu; nhóm rỗng bị ẩn.
// `sort` của JS ổn định nên hai ô trùng giờ giữ thứ tự máy chủ.
function groupByShift(slots: readonly PublicSlot[]) {
  return SHIFT_ORDER.map((shift) => ({
    shift,
    slots: slots
      .filter((slot) => slot.ca === shift)
      .sort((a, b) => Date.parse(a.batDau) - Date.parse(b.batDau)),
  })).filter((group) => group.slots.length > 0);
}

// Lưới khung giờ của MỘT bác sĩ trong MỘT ngày (Figma 446:248). Toàn bộ trạng thái do máy chủ tính; ở đây chỉ chọn cách hiển thị.
export function DoctorSlotGrid({ day }: { day: DoctorDaySlots }) {
  const title = slotDayNoticeTitle(day);
  if (title !== null) return <SlotDayNotice title={title} />;

  const free = day.khungGio.filter((slot) => slot.trangThai === 'ConTrong');
  return (
    <div>
      {day.khungGio.length === 0 || free.length === 0 ? (
        <p className="text-xs text-gray-600">{NO_SLOTS_LEFT}</p>
      ) : (
        <p className="text-xs leading-[15px] text-gray-500">
          <strong className="font-bold text-brand-strong">{free.length}</strong>
          {SLOT_COUNT_REST}
        </p>
      )}
      {groupByShift(day.khungGio).map(({ shift, slots }) => (
        <section key={shift} aria-label={SHIFT_LABEL[shift]} className="mt-3">
          <h3 className="text-[11px] font-semibold uppercase leading-[16.5px] tracking-[0.275px] text-gray-500">
            {SHIFT_LABEL[shift]}
          </h3>
          <ul className="mt-1.5 grid grid-cols-3 gap-2">
            {slots.map((slot) => (
              <SlotCell key={slot.khungGioId} slot={slot} />
            ))}
          </ul>
        </section>
      ))}
      {day.khungGio.length > 0 && <SlotLegend />}
    </div>
  );
}
