import {
  formatVietnamShortDate,
  formatVietnamTime,
} from '../common/appointment-format';
import { StatusChip } from '../common/status-chip';
import type { ReceptionAppointment } from './api/reception-appointment-types';
import { bookedByLabel, detailButtonSuffix, LIST_TEXT } from './list-messages';

const HEADER_CELL = 'px-3.5 py-2.5 text-xs font-semibold text-gray-700';
const BODY_CELL = 'px-3.5 py-3 align-middle';

// `onOpen` nhận mã lịch và NÚT đã bấm: nơi gọi giữ nút để trả tiêu điểm về đúng hàng khi đóng ngăn chi tiết
export type OpenDetail = (maLichHen: string, trigger: HTMLElement) => void;

function AppointmentRow(props: {
  appointment: ReceptionAppointment;
  onOpen: OpenDetail;
}) {
  const { appointment, onOpen } = props;
  const { nguoiKham, nguoiDat } = appointment;
  return (
    <tr className="border-t border-gray-100">
      <td className={`${BODY_CELL} font-mono text-xs text-gray-600`}>
        {appointment.maLichHen}
      </td>
      {/* Figma `479:2`: giờ đậm rồi ngày ngắn "18/10" (không năm) */}
      <td className={BODY_CELL}>
        <p className="font-semibold text-gray-900">
          {formatVietnamTime(appointment.thoiGian)}
        </p>
        <p className="text-xs text-gray-600">
          {formatVietnamShortDate(appointment.thoiGian)}
        </p>
      </td>
      {/* Người khám, SĐT của NGƯỜI ĐẶT (Q32) và, khi hai người khác nhau, người đặt: để không lẫn */}
      <td className={BODY_CELL}>
        <p className="font-medium text-gray-900">{nguoiKham.hoTen}</p>
        <p className="text-xs text-gray-600">{nguoiDat.soDienThoai}</p>
        {!nguoiKham.laBanThan && (
          <p className="text-xs text-gray-600">
            {bookedByLabel(nguoiDat.hoTen)}
          </p>
        )}
      </td>
      <td className={BODY_CELL}>
        <p className="text-gray-900">{appointment.bacSi}</p>
        <p className="text-xs text-brand-strong">{appointment.chuyenKhoa}</p>
      </td>
      <td className={BODY_CELL}>
        <StatusChip status={appointment.trangThai} />
      </td>
      <td className={BODY_CELL}>
        {/* Figma `#0092b8` chữ xanh trên trắng chỉ 3,62:1: dùng `brand-strong` 5,28:1 (ADR 0004). Tên truy cập kèm mã lịch để các nút `Chi tiết` phân biệt được */}
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={(event) =>
            onOpen(appointment.maLichHen, event.currentTarget)
          }
          className="inline-flex min-h-7 items-center rounded-lg px-2 text-xs font-medium text-brand-strong hover:bg-brand-soft"
        >
          {LIST_TEXT.detail}
          <span className="sr-only">
            {detailButtonSuffix(appointment.maLichHen)}
          </span>
        </button>
      </td>
    </tr>
  );
}

// Bảng lịch hẹn (Figma `479:2`: bảy cột, trừ `Kênh` của Q37 nên còn sáu). Cột cuối chỉ có nút `Chi tiết`: `Thu tiền` và `Tiếp đón` của Figma cần `conPhaiThu` và `chuyenDuoc[]` mà
// danh sách B3 không trả (mỗi dòng sẽ là một lần gọi cổng), nên hai nút nằm trong ngăn chi tiết. Màn hẹp cuộn ngang trong vùng có tên và nhận Tab (Figma chỉ có 1440 px).
export function ReceptionTable(props: {
  appointments: readonly ReceptionAppointment[];
  onOpen: OpenDetail;
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
              {columns.code}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.dateTime}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.patient}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.doctor}
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
              onOpen={props.onOpen}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
