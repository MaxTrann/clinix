import { Link } from 'react-router';
import { adminAppointmentDetailPath } from '../../../../shared/routes/booking-paths';
import {
  formatVietnamShortDate,
  formatVietnamTime,
} from '../common/appointment-format';
import type { OperationsAppointment } from '../common/operations-appointment';
import { StatusChip } from '../common/status-chip';
import { bookedByLabel, detailLinkSuffix, LIST_TEXT } from './list-messages';
import { paymentSummary, type PaymentSummary } from './payment-summary';

const HEADER_CELL = 'px-3.5 py-2.5 text-xs font-semibold text-gray-700';
const BODY_CELL = 'px-3.5 py-3 align-middle';

// Chip `Thanh toán` (Figma `511:2`: xám, vàng cam; màu theo token ADR 0004, không chép màu Figma lệch tương phản: `warning` trên `warning-soft` 4,87:1, `gray-700` trên `gray-100`). Nhận diện bằng CHỮ, không chỉ bằng màu.
const PAYMENT_CHIP: Record<PaymentSummary, string> = {
  ChuaThanhToan: 'bg-gray-100 text-gray-700',
  DaDatCoc: 'bg-warning-soft text-warning',
  KhongCoc: 'bg-gray-100 text-gray-700',
  KhongApDung: '',
};

function PaymentCell(props: { trangThai: string; tienCoc: string }) {
  const summary = paymentSummary(props.trangThai, props.tienCoc);
  if (summary === 'KhongApDung') {
    return (
      <span className="text-gray-700">
        <span aria-hidden="true">—</span>
        <span className="sr-only">{LIST_TEXT.payment.KhongApDung}</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_CHIP[summary]}`}
    >
      {LIST_TEXT.payment[summary]}
    </span>
  );
}

function AppointmentRow(props: {
  appointment: OperationsAppointment;
  listSearch: string;
}) {
  const { appointment, listSearch } = props;
  const { nguoiKham, nguoiDat } = appointment;
  return (
    <tr className="border-t border-gray-100">
      <td className={`${BODY_CELL} font-mono text-xs text-gray-600`}>
        {appointment.maLichHen}
      </td>
      {/* Figma `511:2`: ngày ngắn "20/10" rồi giờ "08:00" (khác Lễ tân: giờ rồi ngày), theo NGÀY và giờ Việt Nam */}
      <td className={BODY_CELL}>
        <p className="font-semibold text-gray-900">
          {formatVietnamShortDate(appointment.thoiGian)}
        </p>
        <p className="text-xs text-gray-600">
          {formatVietnamTime(appointment.thoiGian)}
        </p>
      </td>
      {/* Người khám, SĐT của NGƯỜI ĐẶT (Q32) và, khi hai người khác nhau, người đặt: để không lẫn (như Lễ tân, DSV-13) */}
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
      <td className={`${BODY_CELL} text-gray-900`}>{appointment.dichVu}</td>
      <td className={BODY_CELL}>
        <StatusChip status={appointment.trangThai} />
      </td>
      <td className={BODY_CELL}>
        <PaymentCell
          trangThai={appointment.trangThai}
          tienCoc={appointment.tienCoc}
        />
      </td>
      <td className={BODY_CELL}>
        {/* Liên kết tới TRANG chi tiết (Figma `512:2`); kèm `search` của danh sách để `Quay lại danh sách` khôi phục bộ lọc. Figma `#0092b8` chữ xanh trên trắng chỉ 3,62:1: dùng `brand-strong` 5,28:1 (ADR 0004) */}
        <Link
          to={adminAppointmentDetailPath(appointment.maLichHen)}
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

// Bảng lịch hẹn (Figma `511:2`: tám cột; F12 thêm cột `Thanh toán` SUY RA từ trạng thái và cọc, `payment-summary.ts`). Thứ tự dòng GIỮ NGUYÊN thứ tự API (máy chủ sắp `thoi_gian` giảm dần). Màn hẹp cuộn ngang
// trong vùng có tên và nhận Tab (Figma chỉ có 1440 px). `min-w` tăng theo cột mới.
export function AppointmentTable(props: {
  appointments: readonly OperationsAppointment[];
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
      <table className="w-full min-w-[56rem] text-left text-sm">
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
              {columns.service}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.status}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.payment}
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
