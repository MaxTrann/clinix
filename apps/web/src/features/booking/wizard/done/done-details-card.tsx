import {
  CalendarDays,
  MapPin,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../../appointments/common/appointment-format';
import type { PatientAppointmentDetail } from '../../appointments/patient/api/patient-appointment-types';
import { DONE_TEXT } from './done-messages';

// Một hàng của thẻ: biểu tượng, nhãn nhỏ phía trên, giá trị đậm, dòng phụ tuỳ chọn (Figma `453:2`)
function Row({
  icon: Icon,
  label,
  note,
  children,
}: {
  icon: LucideIcon;
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 border-b border-gray-100 py-3 last:border-b-0">
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-gray-600"
      />
      <div className="min-w-0">
        <dt className="text-xs font-medium text-gray-600">{label}</dt>
        <dd className="font-semibold break-words text-gray-900">{children}</dd>
        {note !== undefined && (
          <dd className="text-sm break-words text-gray-600">{note}</dd>
        )}
      </div>
    </div>
  );
}

// Thẻ "Chi tiết lịch hẹn" của phiếu (booking F7; Figma `453:2`): năm hàng từ chi tiết `GET /patient/appointments/:maLichHen`. Khác Figma vì API không có khoá tương ứng:
// bác sĩ không có chức danh ("ThS.BS."), chi nhánh không có địa chỉ (`[cần điền]`). KHÔNG có "Lý do khám" (Figma không có; dữ liệu sức khoẻ). Ngày và giờ theo GIỜ VIỆT NAM,
// không theo múi giờ của máy (hàm của F1).
export function DoneDetailsCard({
  detail,
}: {
  detail: PatientAppointmentDetail;
}) {
  const who = detail.nguoiKham.laBanThan
    ? DONE_TEXT.ownPerson
    : DONE_TEXT.relativePerson;
  return (
    <section
      aria-labelledby="done-details-title"
      className="rounded-2xl border border-gray-200 bg-white p-5"
    >
      <h2
        id="done-details-title"
        className="text-sm font-semibold tracking-wide text-gray-600 uppercase"
      >
        {DONE_TEXT.detailsTitle}
      </h2>
      <dl className="mt-1">
        <Row icon={Stethoscope} label={DONE_TEXT.service}>
          {detail.dichVu}
        </Row>
        <Row icon={UserRound} label={DONE_TEXT.doctor} note={detail.chuyenKhoa}>
          {detail.bacSi}
        </Row>
        <Row icon={MapPin} label={DONE_TEXT.branch}>
          {detail.chiNhanh}
        </Row>
        <Row
          icon={CalendarDays}
          label={DONE_TEXT.visitDateTime}
          note={formatVietnamTime(detail.thoiGian)}
        >
          {formatVietnamWeekdayDate(detail.thoiGian)}
        </Row>
        <Row icon={Users} label={DONE_TEXT.person}>
          {`${detail.nguoiKham.hoTen} · ${who}`}
        </Row>
      </dl>
    </section>
  );
}
