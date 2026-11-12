import { Link } from 'react-router';
import { patientAppointmentDetailPath } from '../../../../shared/routes/booking-paths';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
  formatVnd,
} from '../common/appointment-format';
import { StatusChip } from '../common/status-chip';
import type { PatientAppointment } from './api/patient-appointment-types';
import { detailLinkSuffix, LIST_TEXT } from './list-messages';

const HEADER_CELL = 'px-3.5 py-2.5 text-xs font-semibold text-gray-700';
const BODY_CELL = 'px-3.5 py-3 align-middle';

function AppointmentRow({ appointment }: { appointment: PatientAppointment }) {
  const { nguoiKham } = appointment;
  return (
    <tr className="border-t border-gray-100">
      <td className={BODY_CELL}>
        <p className="font-semibold text-gray-900">
          {formatVietnamWeekdayDate(appointment.thoiGian)}
        </p>
        <p className="text-gray-900">
          {formatVietnamTime(appointment.thoiGian)}
        </p>
        <p className="font-mono text-xs text-gray-600">
          {appointment.maLichHen}
        </p>
      </td>
      <td className={BODY_CELL}>
        <p className="text-gray-900">{appointment.bacSi}</p>
        <p className="text-gray-600">{appointment.chuyenKhoa}</p>
      </td>
      <td className={BODY_CELL}>
        <p className="text-gray-900">{nguoiKham.hoTen}</p>
        <p className="text-gray-600">
          {nguoiKham.laBanThan ? LIST_TEXT.ownPerson : LIST_TEXT.relativePerson}
        </p>
      </td>
      <td className={`${BODY_CELL} text-right whitespace-nowrap text-gray-900`}>
        {formatVnd(appointment.giaSnapshot)}
      </td>
      <td className={BODY_CELL}>
        <StatusChip status={appointment.trangThai} />
      </td>
      <td className={BODY_CELL}>
        {/* F2 bật liên kết tới trang chi tiết. Tên truy cập kèm mã lịch hẹn để các liên kết `Chi tiết` trong bảng phân biệt được với nhau */}
        <Link
          to={patientAppointmentDetailPath(appointment.maLichHen)}
          className="inline-block rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {LIST_TEXT.detail}
          <span className="sr-only">
            {detailLinkSuffix(appointment.maLichHen)}
          </span>
        </Link>
      </td>
    </tr>
  );
}

// Bảng lịch hẹn (Figma `411:2`: sáu cột). Figma chỉ có khung 1440 px, không có khung điện thoại: màn hẹp cuộn ngang trong vùng có tên và nhận Tab
// (nhóm bổ sung khung điện thoại sau). `appointments` đã theo thứ tự API trả (mới nhất trước khi không có `nhom`).
export function AppointmentTable({
  appointments,
}: {
  appointments: readonly PatientAppointment[];
}) {
  const { columns } = LIST_TEXT;
  return (
    <div
      role="region"
      aria-label={LIST_TEXT.resultsRegion}
      tabIndex={0}
      className="overflow-x-auto rounded-xl border border-gray-200 bg-white"
    >
      <table className="w-full min-w-[46rem] text-left text-sm">
        <caption className="sr-only">{LIST_TEXT.tableCaption}</caption>
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className={HEADER_CELL}>
              {columns.appointment}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.doctor}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.person}
            </th>
            <th scope="col" className={`${HEADER_CELL} text-right`}>
              {columns.price}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.status}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.actions}
            </th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((appointment) => (
            <AppointmentRow
              key={appointment.maLichHen}
              appointment={appointment}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
