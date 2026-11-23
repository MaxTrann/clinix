import { useId } from 'react';
import { Link } from 'react-router';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import type { ShiftAppointments } from '../api/appointments-api';
import type { LoadState } from '../reception/use-reception-data';
import { missingCount, summarize, vnTimeOf } from './appointment-group';
import { AppointmentStateChip } from './state-chip';

export interface AppointmentsPanelProps {
  state: LoadState<ShiftAppointments>;
  onRetry: () => void;
  // Liên kết "Xem tất cả" khi danh sách bị cắt (hộp Bác sĩ); không có thì chỉ báo số còn thiếu
  seeAllHref?: string;
}

// Mục "Lịch hẹn trong ca" dùng chung cho hộp "Chi tiết ca làm việc" của Bác sĩ và ngăn kéo "Chi tiết ca" của Lễ tân (doctor UX6; G1, G9; WL-13 [đề xuất]).
// Chỉ HIỆN giờ, người khám, dịch vụ, trạng thái (kèm chữ, không chỉ màu): không SĐT, ngày sinh, mã lịch, giá. Tên người khám chỉ nằm trong nội dung dòng,
// không vào `aria-label` của nút mở, URL hay thông báo lỗi. Đang tải và lỗi KHÔNG che phần thông tin ca ở trên.
export function AppointmentsPanel({
  state,
  onRetry,
  seeAllHref,
}: AppointmentsPanelProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h3
        id={headingId}
        className="text-xs font-semibold tracking-wide text-gray-700 uppercase"
      >
        Lịch hẹn trong ca
      </h3>
      {state.status === 'loading' && (
        <LoadingState message="Đang tải lịch hẹn trong ca..." />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={onRetry} />
      )}
      {state.status === 'success' && (
        <Loaded data={state.data} seeAllHref={seeAllHref} />
      )}
    </section>
  );
}

function Loaded({
  data,
  seeAllHref,
}: {
  data: ShiftAppointments;
  seeAllHref?: string;
}) {
  if (data.total === 0 && data.lines.length === 0)
    return (
      <p className="mt-2 text-sm text-gray-600">Ca này chưa có lịch hẹn.</p>
    );
  const missing = missingCount(data.total, data.lines.length);
  return (
    <>
      <p className="mt-2 text-sm font-medium text-gray-900">
        {summarize(data.counts).text}
      </p>
      <ul
        aria-label="Lịch hẹn trong ca"
        className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200"
      >
        {data.lines.map((line) => (
          <li
            key={line.maLichHen}
            className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 px-3 py-3"
          >
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {vnTimeOf(line.thoiGian) ?? '—'}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium break-words text-gray-900">
                {line.nguoiKham || '—'}
              </p>
              {line.dichVu !== '' && (
                <p className="text-xs break-words text-gray-600">
                  {line.dichVu}
                </p>
              )}
              <div className="mt-1">
                <AppointmentStateChip status={line.trangThai} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      {missing > 0 && (
        <p className="mt-3 text-sm text-gray-700">
          Còn {missing} lịch hẹn nữa.
          {seeAllHref !== undefined && (
            <>
              {' '}
              <Link
                to={seeAllHref}
                className="font-medium text-brand-strong underline"
              >
                Xem tất cả trong Lịch hẹn
              </Link>
            </>
          )}
        </p>
      )}
    </>
  );
}
