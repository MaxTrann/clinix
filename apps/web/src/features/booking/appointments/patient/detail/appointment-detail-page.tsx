import { ArrowLeft } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { PATIENT_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import { ErrorState } from '../../../../../shared/ui/error-state';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import {
  classifyDetailError,
  type DetailErrorKind,
} from '../../common/error-kinds';
import { LIST_TEXT } from '../list-messages';
import { CancelSection } from './cancel-section';
import { DetailCostCard } from './detail-cost';
import { DetailInfoCard, RecordCard } from './detail-info';
import { DETAIL_TEXT } from './detail-messages';
import { DetailSummary } from './detail-summary';
import { DetailTimeline } from './detail-timeline';
import { useAppointmentDetail } from './use-appointment-detail';
import { useCancelBox } from './use-cancel-box';

function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="my-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
    >
      {children}
    </div>
  );
}

// Lỗi tải chi tiết, chọn theo `maLoi` (F2-J). `notFound`: MỘT màn cho mọi lý do không xem được, kèm liên kết về danh sách.
function LoadFailure({
  kind,
  error,
  onRetry,
}: {
  kind: DetailErrorKind;
  error: unknown;
  onRetry: () => void;
}) {
  if (kind === 'notFound') {
    return (
      <Notice>
        <p>{DETAIL_TEXT.notFound}</p>
        <Link
          to={PATIENT_APPOINTMENTS_PATH}
          className="mt-2 block font-medium underline"
        >
          {DETAIL_TEXT.backToList}
        </Link>
      </Notice>
    );
  }
  if (kind === 'session') return <Notice>{LIST_TEXT.sessionExpired}</Notice>;
  if (kind === 'forbidden') return <Notice>{DETAIL_TEXT.forbidden}</Notice>;
  return <ErrorState error={error} onRetry={onRetry} />;
}

function AppointmentDetail({ maLichHen }: { maLichHen: string }) {
  const { view, reload, markCancelled } = useAppointmentDetail(maLichHen);
  const box = useCancelBox({
    maLichHen,
    onCancelled: markCancelled,
    onStale: reload,
  });
  // Đóng hộp huỷ mà nút `Hủy lịch hẹn` không còn: tiêu điểm về tiêu đề trang (xem `CancelSection`)
  const headingRef = useRef<HTMLHeadingElement>(null);

  return (
    <section className="mx-auto max-w-[64rem]">
      <Link
        to={PATIENT_APPOINTMENTS_PATH}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {DETAIL_TEXT.backToList}
      </Link>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="pt-2 text-2xl font-bold text-gray-900 outline-none"
      >
        {DETAIL_TEXT.title}
      </h1>

      {view.kind === 'loading' && (
        <LoadingState message={DETAIL_TEXT.loading} />
      )}
      {view.kind === 'error' && (
        <LoadFailure
          kind={classifyDetailError(view.error)}
          error={view.error}
          onRetry={reload}
        />
      )}
      {view.kind === 'ready' && (
        <div aria-busy={view.refreshing} className="mt-5 flex flex-col gap-4">
          <DetailSummary detail={view.detail} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
            <div className="flex flex-col gap-4">
              <DetailInfoCard detail={view.detail} />
              <RecordCard />
            </div>
            <div className="flex flex-col gap-4">
              <DetailCostCard detail={view.detail} />
              <DetailTimeline status={view.detail.trangThai} />
              <CancelSection
                detail={view.detail}
                box={box}
                onReload={reload}
                fallbackFocusRef={headingRef}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Trang chi tiết một lịch hẹn của Bệnh nhân (booking F2; Figma `420:2`, `426:2`, `691:2`). `key={maLichHen}`: đổi mã trên URL (cùng component) thì reset MỌI state, kể
// cả hộp huỷ và kết quả huỷ của lịch trước (LCT-10). Dữ liệu chỉ ở state của trang: không kho trình duyệt, tải lại là GET lại. Chỉ GET khi xem; POST chỉ khi
// bấm `Xác nhận hủy`.
export function AppointmentDetailPage() {
  const { maLichHen = '' } = useParams();
  return <AppointmentDetail key={maLichHen} maLichHen={maLichHen} />;
}
