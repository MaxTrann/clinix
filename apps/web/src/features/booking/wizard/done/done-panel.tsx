import { useEffect, useRef, type RefObject } from 'react';
import { LoadingState } from '../../../../shared/ui/loading-state';
import type { PatientAppointmentDetail } from '../../appointments/patient/api/patient-appointment-types';
import { useAppointmentDetail } from '../../appointments/patient/detail/use-appointment-detail';
import { DoneActions } from './done-actions';
import { DoneFailure } from './done-failure';
import { DONE_TEXT } from './done-messages';
import { DoneReceipt } from './done-receipt';
import { doneViewOf } from './done-state';
import { DoneStateNotice } from './done-state-notice';

function DoneBody({
  detail,
  headingRef,
}: {
  detail: PatientAppointmentDetail;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const view = doneViewOf(detail.trangThai);
  return (
    <>
      {view.kind === 'receipt' ? (
        <DoneReceipt detail={detail} headingRef={headingRef} />
      ) : (
        <DoneStateNotice detail={detail} view={view} headingRef={headingRef} />
      )}
      <DoneActions />
    </>
  );
}

// Thân Bước 6 "Hoàn tất" (booking F7; Figma `453:2`): TẢI lịch hẹn từ `GET /patient/appointments/:maLichHen` theo mã trên URL (bản nháp của Bước 5 đã bị xoá, không có gì đi qua context;
// tải lại trang là GET lại, không lưu gì ở trình duyệt, WZ-09). Dùng lại hook của trang chi tiết F2 (`useRemote` + `useKeepPrevious`; chỉ GET, bỏ qua `markCancelled`):
//  - `useRemote` huỷ yêu cầu khi gỡ trang hay đổi mã nên không cần `usePageActive` (F7 không viết `await` nào, cũng không điều hướng sau khi tải);
//  - `useKeepPrevious` giữ dữ liệu CŨ khi mã đổi, nên nơi gắn (`steps/done-step.tsx`) PHẢI bọc `key={maLichHen}`, nếu không phiếu của lịch trước hiện trong lúc tải lịch sau.
// Trợ năng (WZ-14): tiêu điểm chuyển tới `h1` MỘT lần khi nội dung đầu tiên hiện (phiếu hay thông báo); không thêm vùng `aria-live` thứ hai (tiêu điểm vào `h1` đã được đọc);
// tải lại sau lỗi hay `refreshing` không kéo tiêu điểm lần nữa.
export function DonePanel({ maLichHen }: { maLichHen: string }) {
  const { view, reload } = useAppointmentDetail(maLichHen);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  const ready = view.kind === 'ready';

  useEffect(() => {
    if (ready && !focused.current) {
      focused.current = true;
      headingRef.current?.focus();
    }
  }, [ready]);

  return (
    <div aria-busy={view.kind === 'ready' ? view.refreshing : undefined}>
      {view.kind === 'loading' && <LoadingState message={DONE_TEXT.loading} />}
      {view.kind === 'error' && (
        <DoneFailure error={view.error} onRetry={reload} />
      )}
      {view.kind === 'ready' && (
        <DoneBody detail={view.detail} headingRef={headingRef} />
      )}
    </div>
  );
}
