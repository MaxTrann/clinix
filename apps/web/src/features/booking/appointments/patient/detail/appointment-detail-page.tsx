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
import { DetailColumns, DetailPageFrame } from '../../common/detail-frame';
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
    <DetailPageFrame
      backTo={PATIENT_APPOINTMENTS_PATH}
      backLabel={DETAIL_TEXT.backToList}
      title={DETAIL_TEXT.title}
      headingRef={headingRef}
    >
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
          <DetailColumns
            main={
              <>
                <DetailInfoCard detail={view.detail} />
                <RecordCard />
              </>
            }
            side={
              <>
                <DetailCostCard detail={view.detail} />
                <DetailTimeline status={view.detail.trangThai} />
                <CancelSection
                  detail={view.detail}
                  box={box}
                  onReload={reload}
                  fallbackFocusRef={headingRef}
                />
              </>
            }
          />
        </div>
      )}
    </DetailPageFrame>
  );
}

// Trang chi tiết một lịch hẹn của Bệnh nhân (booking F2; Figma `420:2`, `426:2`, `691:2`). `key={maLichHen}`: đổi mã trên URL (cùng component) thì reset MỌI state, kể
// cả hộp huỷ và kết quả huỷ của lịch trước (LCT-10). Dữ liệu chỉ ở state của trang: không kho trình duyệt, tải lại là GET lại. Chỉ GET khi xem; POST chỉ khi
// bấm `Xác nhận hủy`.
export function AppointmentDetailPage() {
  const { maLichHen = '' } = useParams();
  return <AppointmentDetail key={maLichHen} maLichHen={maLichHen} />;
}
