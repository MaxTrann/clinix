import { CalendarCheck, CalendarClock, type LucideIcon } from 'lucide-react';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../../common/appointment-format';
import { DetailCard, DetailRow } from '../../common/detail-card';
import { RESCHEDULE_TEXT } from './reschedule-text';

// Hai thẻ giờ của trang đổi lịch (reschedule F1, WDH-02; F2 thêm "Lịch mới" cho màn xác nhận): chỉ có NGÀY và GIỜ KHÁM vì preview (PLAN 5.8) chỉ trả `thoiGian` (và `bacSiId` để vẽ lưới). Prop chỉ cần
// `{ thoiGian }` nên Lễ tân đổi hộ (F3) dùng lại được. Giờ ISO UTC đổi sang giờ Việt Nam bằng `formatVietnam*` (không `getHours()`: 17:30Z đã là 00:30 ngày hôm sau ở Việt Nam).
function TimeCard({
  icon,
  title,
  thoiGian,
}: {
  icon: LucideIcon;
  title: string;
  thoiGian: string;
}) {
  return (
    <DetailCard icon={icon} title={title}>
      <dl className="px-5 py-1">
        <DetailRow label={RESCHEDULE_TEXT.visitDate}>
          <time dateTime={thoiGian}>{formatVietnamWeekdayDate(thoiGian)}</time>
        </DetailRow>
        <DetailRow label={RESCHEDULE_TEXT.visitTime}>
          {formatVietnamTime(thoiGian)}
        </DetailRow>
      </dl>
    </DetailCard>
  );
}

export function CurrentAppointmentCard({
  current,
}: {
  current: { thoiGian: string };
}) {
  return (
    <TimeCard
      icon={CalendarClock}
      title={RESCHEDULE_TEXT.currentTitle}
      thoiGian={current.thoiGian}
    />
  );
}

export function NewAppointmentCard({ next }: { next: { thoiGian: string } }) {
  return (
    <TimeCard
      icon={CalendarCheck}
      title={RESCHEDULE_TEXT.newTitle}
      thoiGian={next.thoiGian}
    />
  );
}
