import { CalendarClock } from 'lucide-react';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../../common/appointment-format';
import { DetailCard, DetailRow } from '../../common/detail-card';
import { RESCHEDULE_TEXT } from './reschedule-text';
import type { RescheduleCurrent } from './reschedule-types';

// Thẻ "Lịch hiện tại" của trang đổi lịch (reschedule F1, WDH-02): chỉ có NGÀY và GIỜ KHÁM vì preview (PLAN 5.8) chỉ trả `lichCu.thoiGian` (và `bacSiId` để vẽ lưới).
// Giờ ISO UTC đổi sang giờ Việt Nam bằng `formatVietnam*` (không `getHours()`: 17:30Z đã là 00:30 ngày hôm sau ở Việt Nam).
export function CurrentAppointmentCard({
  current,
}: {
  current: RescheduleCurrent;
}) {
  return (
    <DetailCard icon={CalendarClock} title={RESCHEDULE_TEXT.currentTitle}>
      <dl className="px-5 py-1">
        <DetailRow label={RESCHEDULE_TEXT.visitDate}>
          <time dateTime={current.thoiGian}>
            {formatVietnamWeekdayDate(current.thoiGian)}
          </time>
        </DetailRow>
        <DetailRow label={RESCHEDULE_TEXT.visitTime}>
          {formatVietnamTime(current.thoiGian)}
        </DetailRow>
      </dl>
    </DetailCard>
  );
}
