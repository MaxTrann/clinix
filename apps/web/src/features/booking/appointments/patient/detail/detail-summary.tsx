import {
  Calendar,
  MapPin,
  Stethoscope,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../../common/appointment-format';
import { StatusChip } from '../../common/status-chip';
import type { PatientAppointmentDetail } from '../api/patient-appointment-types';
import { LIST_TEXT } from '../list-messages';
import { DETAIL_TEXT } from './detail-messages';

function SummaryCell({
  icon: Icon,
  label,
  children,
  note,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft">
        <Icon aria-hidden="true" className="size-4 text-brand-strong" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-600">{label}</p>
        <p className="text-sm font-semibold break-words text-gray-900">
          {children}
        </p>
        {note !== undefined && (
          <p className="text-xs break-words text-gray-600">{note}</p>
        )}
      </div>
    </div>
  );
}

// Thẻ đầu của trang chi tiết (Figma `420:2`): mã, chip trạng thái, tên chuyên khoa và bốn ô Bác sĩ, Ngày khám, Chi nhánh, Người khám. Giờ theo giờ Việt Nam
// (hàm của F1). Không có chức danh bác sĩ và "(Ca sáng)" vì API không trả (TRACKING 3.27 F2-E (5)).
export function DetailSummary({
  detail,
}: {
  detail: PatientAppointmentDetail;
}) {
  return (
    <section
      aria-label={DETAIL_TEXT.summary}
      className="rounded-2xl border border-gray-200 bg-white p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-mono text-xs tracking-wide text-gray-700">
          {detail.maLichHen}
        </span>
        <StatusChip status={detail.trangThai} />
      </div>
      <h2 className="pt-3 text-2xl font-bold break-words text-gray-900">
        {detail.chuyenKhoa}
      </h2>
      <div className="mt-5 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCell icon={Stethoscope} label={DETAIL_TEXT.doctor}>
          {detail.bacSi}
        </SummaryCell>
        <SummaryCell
          icon={Calendar}
          label={DETAIL_TEXT.visitDate}
          note={formatVietnamTime(detail.thoiGian)}
        >
          {formatVietnamWeekdayDate(detail.thoiGian)}
        </SummaryCell>
        <SummaryCell icon={MapPin} label={DETAIL_TEXT.branch}>
          {detail.chiNhanh}
        </SummaryCell>
        <SummaryCell
          icon={User}
          label={DETAIL_TEXT.person}
          note={
            detail.nguoiKham.laBanThan
              ? LIST_TEXT.ownPerson
              : LIST_TEXT.relativePerson
          }
        >
          {detail.nguoiKham.hoTen}
        </SummaryCell>
      </div>
    </section>
  );
}
