import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useRemote } from '../../../../shared/hooks/use-remote';
import { bookingInfoPath } from '../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { postCheckConfirmation } from '../../api/booking-service';
import type {
  BookingConfirmation,
  CreatedAppointment,
} from '../../api/booking-types';
import { isPositiveAmount } from '../../appointments/common/appointment-format';
import type { BookingDraft } from '../booking-draft-context';
import { CheckFailure } from '../info/check-failure';
import { AppointmentDetailsCard } from './appointment-details-card';
import { CostCard } from './cost-card';
import { CreateFailureNotice } from './create-failure-notice';
import { StepLink } from './step-link';
import { useCreateAppointment } from './use-create-appointment';

// Bước 5 "Xác nhận" (booking F5; Figma `451:2`). Giữ hai thứ: kết quả `POST /booking/checks` của hồ sơ trong bản nháp (lần kiểm LẠI trước khi xác nhận; bản nháp KHÔNG mang tóm tắt) và trạng thái
// của nút xác nhận (`useCreateAppointment`). Nút chính CHỈ bật khi `checks` đã xong, và tắt khi đang gửi, đã tạo xong hay lỗi `final`. `checks` chỉ đọc nên vào Bước 5 KHÔNG giữ chỗ (A1):
// chỉ khi người dùng bấm nút mới có `POST /booking/appointments`.
//
// `active` (`usePageActive()`) và `onCreated` (chuyển trang, dọn bản nháp) do nơi gắn Bước 5 vào wizard truyền vào (`steps/confirm-step.tsx`): panel không biết đích sau khi tạo.
// `data-testid="booking-step-5-body"` và `data-reference` giữ lại từ thân tạm của F3: test của F3 và của router tìm Bước 5 bằng chúng.
interface ConfirmPanelProps {
  khungGioId: string;
  // Bản nháp của Bước 4, đã kiểm đúng khung giờ này (khung wizard đưa về Bước 4 nếu thiếu hay lệch)
  draft: BookingDraft;
  active: { readonly current: boolean };
  onCreated: (created: CreatedAppointment) => void;
}

// Nhãn nút chính: Figma `451:2` chỉ có "Xác nhận và thanh toán cọc" (cọc > 0); cọc 0đ (lịch xác nhận ngay) chưa có frame ⇒ "Xác nhận đặt lịch" [đề xuất]; chưa có dữ liệu thì "Xác nhận"
function confirmLabel(data: BookingConfirmation | undefined): string {
  if (data === undefined) return 'Xác nhận';
  return isPositiveAmount(data.tienCoc)
    ? 'Xác nhận và thanh toán cọc'
    : 'Xác nhận đặt lịch';
}

export function ConfirmPanel({
  khungGioId,
  draft,
  active,
  onCreated,
}: ConfirmPanelProps) {
  const check = useRemote(
    (signal) =>
      postCheckConfirmation(khungGioId, draft.hoSoNguoiThanId, signal),
    [khungGioId, draft.hoSoNguoiThanId],
  );
  const create = useCreateAppointment({
    body: {
      khungGioId,
      hoSoNguoiThanId: draft.hoSoNguoiThanId,
      lyDoKham: draft.lyDoKham,
    },
    active,
    onCreated,
  });

  const { state } = create;
  const sending = state.kind === 'submitting' || state.kind === 'done';
  const data = check.state.status === 'ready' ? check.state.data : undefined;
  const canConfirm = data !== undefined && !sending && state.kind !== 'stopped';

  // Lỗi mới thì đưa tiêu điểm tới vùng thông báo (vùng này cũng là `role="alert"`)
  const noticeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (state.kind === 'failed' || state.kind === 'stopped') {
      noticeRef.current?.focus();
    }
  }, [state]);

  const infoPath = bookingInfoPath(khungGioId);
  return (
    <div data-testid="booking-step-5-body" data-reference={khungGioId}>
      <StepLink
        to={infoPath}
        busy={sending}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 font-medium text-gray-800"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Sửa thông tin người khám
      </StepLink>
      <h1 className="text-2xl font-bold text-gray-900">Xác nhận thông tin</h1>
      <p className="mt-1 text-gray-700">
        Kiểm tra lại trước khi hoàn tất. Bạn có thể sửa từng mục.
      </p>

      <div className="mt-6" aria-busy={check.state.status === 'loading'}>
        {check.state.status === 'loading' && (
          <LoadingState message="Đang kiểm tra lịch hẹn..." />
        )}
        {check.state.status === 'error' && (
          <CheckFailure error={check.state.error} onRetry={check.retry} />
        )}
        {data !== undefined && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <AppointmentDetailsCard
              data={data}
              visitReason={draft.lyDoKham}
              khungGioId={khungGioId}
              busy={sending}
            />
            <CostCard data={data} />
          </div>
        )}
      </div>

      {(state.kind === 'failed' || state.kind === 'stopped') && (
        <div ref={noticeRef} tabIndex={-1} className="mt-4 outline-none">
          <CreateFailureNotice
            failure={state.failure}
            khungGioId={khungGioId}
          />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <StepLink
          to={infoPath}
          busy={sending}
          className="inline-flex min-h-11 items-center rounded-xl border border-gray-500 bg-white px-5 font-semibold text-gray-800"
        >
          Quay lại
        </StepLink>
        {/* Khi đang gửi dùng `aria-disabled` (không `disabled`) để tiêu điểm bàn phím không rơi khỏi nút; bấm lúc đó vô hại vì `useCreateAppointment` có cờ `ref` */}
        <button
          type="button"
          onClick={() => void create.submit()}
          disabled={!canConfirm && !sending}
          aria-disabled={sending || undefined}
          className="inline-flex min-h-11 items-center rounded-xl bg-brand-strong px-5 font-semibold text-white disabled:bg-gray-300 disabled:text-gray-700 aria-disabled:bg-gray-300 aria-disabled:text-gray-700"
        >
          {sending ? 'Đang xử lý…' : confirmLabel(data)}
        </button>
      </div>
    </div>
  );
}
