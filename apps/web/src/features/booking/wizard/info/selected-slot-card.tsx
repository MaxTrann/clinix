import { CalendarDays, Stethoscope, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RemoteState } from '../../../../shared/hooks/use-remote';
import { LoadingState } from '../../../../shared/ui/loading-state';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../../appointments/common/appointment-format';
import { knownBookingError } from '../../api/booking-errors';
import { doctorDisplayName } from '../../api/booking-labels';
import type { BookingSummary } from '../../api/booking-types';
import { CheckFailure } from './check-failure';

// Khối "Lịch hẹn đang chọn" (Figma `449:2`): đúng BA hàng Dịch vụ, Bác sĩ, Thời gian, lấy từ `tomTat` của `POST /booking/checks`. Không giá, không chuyên khoa,
// không chi nhánh (Figma không có; giá và chi nhánh là của Bước 5).
const PROFILE_FAILURE_PLACEHOLDER = 'Chưa có thông tin lịch hẹn cho hồ sơ này.';

function Row({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 border-b border-gray-100 py-3 last:border-b-0">
      <span aria-hidden="true" className="mt-0.5 text-gray-600">
        {icon}
      </span>
      <div>
        <dt className="text-sm text-gray-600">{label}</dt>
        <dd className="font-semibold text-gray-900">{children}</dd>
      </div>
    </div>
  );
}

export function SelectedSlotCard({
  state,
  onRetry,
}: {
  state: RemoteState<BookingSummary>;
  onRetry: () => void;
}) {
  return (
    <aside
      aria-labelledby="selected-slot-title"
      aria-busy={state.status === 'loading'}
      className="self-start rounded-2xl border border-gray-200 bg-white p-5"
    >
      <h2 id="selected-slot-title" className="font-semibold text-gray-900">
        Lịch hẹn đang chọn
      </h2>
      {state.status === 'loading' && (
        <LoadingState message="Đang kiểm tra lịch hẹn..." />
      )}
      {state.status === 'ready' && (
        <dl className="mt-1">
          <Row icon={<Stethoscope className="size-4" />} label="Dịch vụ">
            {state.data.dichVu}
          </Row>
          <Row icon={<UserRound className="size-4" />} label="Bác sĩ">
            {doctorDisplayName(
              state.data.bacSi.chucDanh,
              state.data.bacSi.hoTen,
            )}
          </Row>
          <Row icon={<CalendarDays className="size-4" />} label="Thời gian">
            {formatVietnamTime(state.data.thoiGian)} ·{' '}
            {formatVietnamWeekdayDate(state.data.thoiGian)}
          </Row>
        </dl>
      )}
      {state.status === 'error' &&
        // Lỗi RIÊNG của hồ sơ đang chọn hiện dưới thẻ hồ sơ (chọn hồ sơ khác thì có thể đi tiếp); ở đây chỉ nói chưa có thông tin
        (knownBookingError(state.error)?.scope === 'profile' ? (
          <p className="mt-2 text-sm text-gray-600">
            {PROFILE_FAILURE_PLACEHOLDER}
          </p>
        ) : (
          <CheckFailure error={state.error} onRetry={onRetry} />
        ))}
    </aside>
  );
}
