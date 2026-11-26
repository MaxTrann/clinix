import { Link } from 'react-router';
import { formatVietnamDate, formatVietnamTime } from '../appointment-format';
import { RequestStatusChip } from './request-status-chip';
import { detailLinkSuffix, REQUEST_TEXT } from './request-text';
import type { RequestRow } from './request-types';

const HEADER_CELL = 'px-3.5 py-2.5 text-xs font-semibold text-gray-700';
const BODY_CELL = 'px-3.5 py-3 align-middle';

// "09:00 20/11/2026" theo GIỜ VIỆT NAM (không theo múi giờ máy; 17:30 UTC đã là 00:30 ngày hôm sau)
const when = (iso: string) =>
  `${formatVietnamTime(iso)} ${formatVietnamDate(iso)}`;

function RequestRowView(props: {
  row: RequestRow;
  detailPath: (yeuCauId: string) => string;
  listSearch: string;
}) {
  const { row } = props;
  return (
    <tr className="border-t border-gray-100">
      <td className={`${BODY_CELL} font-mono text-xs text-gray-600`}>
        {row.maLichHen}
      </td>
      <td className={BODY_CELL}>
        <p className="font-medium text-gray-900">{row.nguoiKham.hoTen}</p>
        {row.nguoiKham.laNguoiThan && (
          <p className="text-xs text-gray-600">{REQUEST_TEXT.relative}</p>
        )}
      </td>
      <td className={`${BODY_CELL} text-gray-900`}>{row.bacSi.hoTen}</td>
      <td className={BODY_CELL}>
        <p className="text-gray-900">{when(row.thoiGianCu)}</p>
        <p className="text-xs font-semibold text-brand-strong">
          <span aria-hidden="true">→ </span>
          <span className="sr-only">{REQUEST_TEXT.changedTo} </span>
          {when(row.thoiGianMongMuon)}
        </p>
      </td>
      <td className={`${BODY_CELL} text-gray-900`}>{row.soLanDaTuDoi}</td>
      <td className={`${BODY_CELL} text-gray-900`}>
        {formatVietnamDate(row.thoiDiemTao)}
      </td>
      <td className={BODY_CELL}>
        <RequestStatusChip status={row.trangThai} />
      </td>
      <td className={BODY_CELL}>
        {/* Liên kết tới TRANG chi tiết kèm `search` của danh sách để `Quay lại danh sách` khôi phục tab, trang và bộ lọc. Tên truy cập kèm mã lịch để các liên kết `Chi tiết` phân biệt được */}
        <Link
          to={props.detailPath(row.yeuCauId)}
          state={{ listSearch: props.listSearch }}
          className="inline-flex min-h-7 items-center rounded-lg px-2 text-xs font-medium text-brand-strong hover:bg-brand-soft"
        >
          {REQUEST_TEXT.detail}
          <span className="sr-only">{detailLinkSuffix(row.maLichHen)}</span>
        </Link>
      </td>
    </tr>
  );
}

// Bảng yêu cầu: thứ tự DO MÁY CHỦ (tab Chờ duyệt cũ nhất trước, tab Đã xử lý mới nhất trước), web KHÔNG sắp lại. Màn hẹp cuộn ngang trong vùng có tên và nhận Tab.
// Vùng cuộn phải `relative`: chữ ẩn `sr-only` là `position: absolute`, thiếu nó thì chữ ẩn thoát khỏi vùng và làm cả TRANG tràn ngang ở 375 px (reschedule X3, lỗi L-01).
export function RequestTable(props: {
  rows: readonly RequestRow[];
  detailPath: (yeuCauId: string) => string;
  listSearch: string;
}) {
  const { columns } = REQUEST_TEXT;
  return (
    <div
      role="region"
      aria-label={REQUEST_TEXT.resultsRegion}
      tabIndex={0}
      className="relative overflow-x-auto rounded-xl border border-gray-200 bg-white"
    >
      <table className="w-full min-w-[52rem] text-left text-sm">
        <caption className="sr-only">{REQUEST_TEXT.tableCaption}</caption>
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className={HEADER_CELL}>
              {columns.code}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.patient}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.doctor}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.change}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.selfChanges}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {columns.sent}
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
          {props.rows.map((row) => (
            <RequestRowView
              key={row.yeuCauId}
              row={row}
              detailPath={props.detailPath}
              listSearch={props.listSearch}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
