import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import { useRemote } from '../../../../../shared/hooks/use-remote';
import {
  receptionAppointmentDetailPath,
  receptionAppointmentReschedulePath,
} from '../../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import { BookingNotice } from '../../../wizard/booking-notice';
import { readSlotId } from '../../../wizard/slot-id';
import { CurrentAppointmentCard } from '../../common/current-appointment-card';
import { DetailPageFrame } from '../../common/detail-frame';
import { RescheduleConfirmForm } from '../../common/reschedule-confirm-form';
import { rescheduleReasonMessage } from '../../common/reschedule-errors';
import {
  candidateReasonMessage,
  describeRescheduleFailure,
  type RescheduleFailure,
} from '../../common/reschedule-failure';
import {
  noticeState,
  slotNoticeFor,
} from '../../common/reschedule-notice-state';
import type { RescheduleDone } from '../../common/reschedule-payload';
import { RESCHEDULE_TEXT } from '../../common/reschedule-text';
import {
  AppointmentSummaryCard,
  RESCHEDULE_LINK_CLASS,
  RescheduleFailureCard,
  RescheduleSubmitNotice,
} from '../../common/reschedule-views';
import { getReceptionAppointment } from '../api/reception-appointment-detail-api';
import { receptionRescheduleLinks } from './reception-reschedule-links';
import {
  RECEPTION_FAILURE_CONTEXT,
  RECEPTION_REASON,
  RECEPTION_RESCHEDULE_TEXT,
} from './reception-reschedule-text';
import type { ReceptionReschedulePreview } from './reception-reschedule-types';
import { useReceptionReschedulePreview } from './use-reception-reschedule-preview';
import { useReceptionRescheduleSubmit } from './use-reception-reschedule-submit';

// Lỗi mà làm lại cũng không hết: thay cả biểu mẫu bằng thẻ kèm đường đi (không có nút gửi nữa). Còn lại (`retry`, `uncertain`, lỗi ở ô lý do) giữ biểu mẫu và chữ đã gõ.
const FINAL_FAILURES: readonly RescheduleFailure['kind'][] = [
  'pickAnother',
  'backToDetail',
  'notFound',
  'session',
];

// Thẻ "Lịch hẹn" (bác sĩ, chuyên khoa, chi nhánh, người khám) từ CHI TIẾT lịch của Lễ tân: preview không có các tên này (PLAN 5.8). Lời gọi PHỤ, không chặn: đang tải hay lỗi thì không vẽ gì và không báo lỗi.
// Tải song song với preview.
function AppointmentSummary({ maLichHen }: { maLichHen: string }) {
  const { state } = useRemote(
    (signal) => getReceptionAppointment(maLichHen, signal),
    [maLichHen],
  );
  if (state.status !== 'ready') return null;
  const detail = state.data;
  return (
    <AppointmentSummaryCard
      doctor={detail.bacSi}
      specialty={detail.chuyenKhoa}
      branch={detail.chiNhanh}
      person={detail.nguoiKham.hoTen}
    />
  );
}

type SubmitController = ReturnType<typeof useReceptionRescheduleSubmit>;

function ConfirmBody({
  preview,
  khungGioId,
  maLichHen,
  submit,
  onRetry,
}: {
  preview: ReceptionReschedulePreview;
  khungGioId: string;
  maLichHen: string;
  submit: SubmitController;
  onRetry: () => void;
}) {
  const candidate = preview.lichMoi;
  const links = receptionRescheduleLinks(maLichHen);
  if (!preview.choPhepDoi) {
    return (
      <BookingNotice message={rescheduleReasonMessage(preview.lyDoKhongDoi)}>
        <Link to={links.detail} className={RESCHEDULE_LINK_CLASS}>
          {RESCHEDULE_TEXT.backToDetailLink}
        </Link>
      </BookingNotice>
    );
  }
  // Có `khungGioId` thì B7 luôn trả `lichMoi` đúng khung giờ đó; thiếu hay lệch là phản hồi không dùng được (không vẽ "Lịch mới" của một khung giờ khác)
  if (candidate === null || candidate.khungGioId !== khungGioId) {
    return (
      <RescheduleFailureCard
        failure={describeRescheduleFailure(
          new UnexpectedResponseError(200),
          'load',
          RECEPTION_FAILURE_CONTEXT,
        )}
        links={links}
        onRetry={onRetry}
      />
    );
  }
  if (!candidate.hopLe) {
    return (
      <>
        <CurrentAppointmentCard current={preview.lichCu} />
        <BookingNotice
          message={candidateReasonMessage(candidate.lyDoKhongHopLe)}
        >
          <Link to={links.grid} className={RESCHEDULE_LINK_CLASS}>
            {RESCHEDULE_TEXT.pickAnother}
          </Link>
        </BookingNotice>
      </>
    );
  }

  const failure = submit.state.kind === 'failed' ? submit.state.failure : null;
  if (failure !== null && FINAL_FAILURES.includes(failure.kind)) {
    return <RescheduleFailureCard failure={failure} links={links} />;
  }
  return (
    <RescheduleConfirmForm
      current={preview.lichCu}
      next={candidate}
      intro={
        <>
          {RECEPTION_RESCHEDULE_TEXT.intro}
          {preview.coYeuCauChoDuyet && (
            <span className="mt-1 block">
              {RECEPTION_RESCHEDULE_TEXT.pendingRequest}
            </span>
          )}
        </>
      }
      reason={RECEPTION_REASON}
      reasonError={failure?.kind === 'reasonInvalid' ? failure.message : null}
      focusReasonKey={submit.reasonFocus}
      submitLabel={RECEPTION_RESCHEDULE_TEXT.confirmButton}
      submittingLabel={RESCHEDULE_TEXT.sending}
      submitting={submit.state.kind === 'submitting'}
      renderNotice={(submitNow) =>
        failure !== null && failure.kind !== 'reasonInvalid' ? (
          <RescheduleSubmitNotice
            failure={failure}
            onRetry={submitNow}
            uncertainLink={{
              to: links.detail,
              label: RECEPTION_RESCHEDULE_TEXT.seeDetail,
            }}
          />
        ) : null
      }
      onSubmit={(reason) => void submit.submit(reason)}
    />
  );
}

function Confirm({
  maLichHen,
  khungGioId,
}: {
  maLichHen: string;
  khungGioId: string;
}) {
  const navigate = useNavigate();
  const { state, retry } = useReceptionReschedulePreview(maLichHen, khungGioId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // `replace`: màn xác nhận đã xong việc, Back không quay về nó. Kết quả là chi tiết lịch MỚI kèm thông báo một lần (`reschedule-notice-state.ts`; không có chữ của máy chủ trong `state`).
  const onDone = useCallback(
    (result: RescheduleDone) => {
      void navigate(
        receptionAppointmentDetailPath(result.lichHenMoi.maLichHen),
        { replace: true, state: noticeState('DaDoi') },
      );
    },
    [navigate],
  );
  // Khung giờ vừa chọn không còn chọn được: về lưới (trang chọn gắn lại nên GET lại preview và lưới), kèm câu của mã đó
  const onSlotGone = useCallback(
    (maLoi: string) => {
      const notice = slotNoticeFor(maLoi);
      void navigate(receptionAppointmentReschedulePath(maLichHen), {
        replace: true,
        state: notice === null ? null : noticeState(notice),
      });
    },
    [maLichHen, navigate],
  );
  const submit = useReceptionRescheduleSubmit({
    maLichHen,
    khungGioId,
    onDone,
    onSlotGone,
  });
  const submitting = submit.state.kind === 'submitting';
  const links = receptionRescheduleLinks(maLichHen);

  return (
    <DetailPageFrame
      backTo={links.grid}
      backLabel={RESCHEDULE_TEXT.pickAnother}
      title={RECEPTION_RESCHEDULE_TEXT.confirmTitle}
      headingRef={headingRef}
      busy={submitting}
      backDisabled={submitting}
      onBackClick={(event) => {
        // Đang gửi mà rời trang thì người dùng không biết kết quả: giữ ở lại cho tới khi máy chủ trả lời
        if (submitting) event.preventDefault();
      }}
    >
      <div className="mt-5 flex flex-col gap-4">
        <AppointmentSummary maLichHen={maLichHen} />
        {state.status === 'loading' && (
          <LoadingState message={RESCHEDULE_TEXT.loading} />
        )}
        {state.status === 'error' && (
          <RescheduleFailureCard
            failure={describeRescheduleFailure(
              state.error,
              'load',
              RECEPTION_FAILURE_CONTEXT,
            )}
            links={links}
            onRetry={retry}
          />
        )}
        {state.status === 'ready' && (
          <ConfirmBody
            preview={state.data}
            khungGioId={khungGioId}
            maLichHen={maLichHen}
            submit={submit}
            onRetry={retry}
          />
        )}
      </div>
    </DetailPageFrame>
  );
}

function InvalidLink({ maLichHen }: { maLichHen: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const { grid } = receptionRescheduleLinks(maLichHen);
  return (
    <DetailPageFrame
      backTo={grid}
      backLabel={RESCHEDULE_TEXT.pickAnother}
      title={RECEPTION_RESCHEDULE_TEXT.confirmTitle}
      headingRef={headingRef}
    >
      <BookingNotice message={RESCHEDULE_TEXT.invalidLink}>
        <Link to={grid} className={RESCHEDULE_LINK_CLASS}>
          {RESCHEDULE_TEXT.pickAnother}
        </Link>
      </BookingNotice>
    </DetailPageFrame>
  );
}

// Màn xác nhận ĐỔI LỊCH HỘ của Lễ tân (reschedule F3; PLAN reschedule 5.12, 5.13; 2.4.30 bước 6, 7, A1, A2). Mã lịch ở đường dẫn, `khungGioId` ở query đọc bằng `readSlotId` (id BIGINT dạng chuỗi; thiếu, rỗng,
// sai dạng hay lặp khoá ⇒ không hợp lệ): không lưu gì ở trình duyệt nên tải lại trang vẫn chạy. Gọi preview CÓ `khungGioId` để lấy giờ mới và `hopLe` (máy chủ quyết, web không tự suy), rồi mới cho gửi; ô lý do
// BẮT BUỘC 1 đến 255 đơn vị UTF-16 (Q9). KHÔNG có "còn n lần" và KHÔNG nhãn "Gửi yêu cầu": đổi hộ không có hạn mức. `key` theo cả mã lịch và id: đổi một trong hai trên URL thì reset mọi state (lý do đã gõ, lỗi lần
// gửi trước).
export function ReceptionRescheduleConfirmPage() {
  const { maLichHen = '' } = useParams();
  const [params] = useSearchParams();
  const khungGioId = readSlotId(params);
  if (khungGioId === null) return <InvalidLink maLichHen={maLichHen} />;
  return (
    <Confirm
      key={`${maLichHen}:${khungGioId}`}
      maLichHen={maLichHen}
      khungGioId={khungGioId}
    />
  );
}
