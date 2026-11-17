import { useCallback, useMemo, useState } from 'react';
import { todayVn } from '../../../shared/schedule/week';
import { slotWindow } from './slot-dates';

/**
 * Ngày đang xem của một trang bác sĩ: mặc định HÔM NAY theo giờ Việt Nam (Q18), tính MỘT lần khi trang gắn. Ngày chỉ nằm trong state của trang
 * (không lên URL, không ghi storage; Đại duyệt 17/11/2026): đổi trang hay bộ lọc vẫn giữ ngày, rời trang rồi quay lại thì về hôm nay.
 * `resetToToday` tính lại "hôm nay" (trang để mở qua nửa đêm) và dựng lại dải 7 ngày.
 */
export function useSlotDate() {
  const [today, setToday] = useState(() => todayVn());
  const [date, setDate] = useState(today);
  const dates = useMemo(() => slotWindow(today), [today]);
  const resetToToday = useCallback(() => {
    const now = todayVn();
    setToday(now);
    setDate(now);
  }, []);
  return { today, dates, date, setDate, resetToToday };
}

export type SlotDate = ReturnType<typeof useSlotDate>;
