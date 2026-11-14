import { Link } from 'react-router';
import { doctorAppointmentDetailPath } from '../../../../shared/routes/booking-paths';
import {
  formatVietnamShortWeekdayDate,
  formatVietnamTime,
} from '../common/appointment-format';
import { StatusChip } from '../common/status-chip';
import type { DoctorAppointment } from './api/doctor-appointment-types';
import { detailLinkSuffix, LIST_TEXT } from './list-messages';

const HEADER_CELL = 'px-3.5 py-2.5 text-xs font-semibold text-gray-700';
const BODY_CELL = 'px-3.5 py-3 align-middle';

function AppointmentRow(props: {
  appointment: DoctorAppointment;
  listSearch: string;
}) {
  const { appointment, listSearch } = props;
  const { nguoiKham } = appointment;
  return (
    <tr className="border-t border-gray-100">
      {/* Figma `457:2`: ngày ngắn có thứ đậm, giờ, rồi mã lịch chữ đơn cách. Ngày và giờ theo giờ Việt Nam, không theo múi giờ máy */}
      <td className={BODY_CELL}>
        <p className="font-semibold text-gray-900">
          {formatVietnamShortWeekdayDate(appointment.thoiGian)}
        </p>
        <p className="text-gray-900">
          {formatVietnamTime(appointment.thoiGian)}
        </p>
        <p className="font-mono text-xs text-gray-600">
          {appointment.maLichHen}
        </p>
      </td>
      {/* Người ĐƯỢC KHÁM và SĐT của người khám (không phải người đặt); SĐT trống thì không có dòng thứ hai [đề xuất] */}
      <td className={BODY_CELL}>
        <p className="font-medium text-gray-900">{nguoiKham.hoTen}</p>
        {nguoiKham.soDienThoai !== null && (
          <p className="text-gray-600">{nguoiKham.soDienThoai}</p>
        )}
      </td>
      <td className={`${BODY_CELL} text-gray-900`}>{appointment.chuyenKhoa}</td>
      {/* Lý do khám là chữ tự do của bệnh nhân (dữ liệu sức khoẻ): React thoát chuỗi, không `dangerouslySetInnerHTML` */}
      <td className={`${BODY_CELL} max-w-[18rem] break-words text-gray-700`}>
        {appointment.lyDoKham ?? LIST_TEXT.noReason}
      </td>
      <td className={BODY_CELL}>
        <StatusChip status={appointment.trangThai} />
      </td>
      <td className={BODY_CELL}>
        {/* Liên kết tới TRANG chi tiết (Figma `458:2`); kèm `search` của danh sách (KHÔNG có `q`, KHÔNG có lý do khám) để `← Lịch hẹn` khôi phục bộ lọc. Figma `#0092b8` chữ xanh trên trắng chỉ 3,62:1:
            dùng `brand-strong` 5,28:1 (ADR 0004). Tên truy cập kèm mã lịch để các liên kết `Chi tiết` phân biệt được */}
        <Link
          to={doctorAppointmentDetailPath(appointment.maLichHen)}
          state={{ listSearch }}
          className="inline-flex min-h-7 items-center rounded-lg px-2 text-xs font-medium text-brand-strong hover:bg-brand-soft"
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

// Bảng lịch hẹn của Bác sĩ (Figma `457:2`: sáu cột; KHÔNG cột bác sĩ, chi nhánh, giá: lịch của chính bác sĩ, Q33). Thứ tự dòng GIỮ NGUYÊN thứ tự API (máy chủ sắp theo `sapXep`). KHÔNG nhãn con "Đã có hồ sơ khám"
// hay "Chưa ghi hồ sơ" dưới chip `Hoàn thành`: cần một cờ mà B5 không trả (TRACKING 3.38 F11-B). Màn hẹp cuộn ngang trong vùng có tên và nhận Tab (Figma chỉ có 1440 px).
export function DoctorTable(props: {
  appointments: readonly DoctorAppointment[];
  listSearch: string;
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
              {columns.dateTime}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.patient}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.specialty}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.reason}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.status}
            </th>
            <th scope="col" className={HEADER_CELL}>
              <span className="sr-only">{columns.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.appointments.map((appointment) => (
            <AppointmentRow
              key={appointment.maLichHen}
              appointment={appointment}
              listSearch={props.listSearch}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
