import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import { useRemote } from '../../../../../shared/hooks/use-remote';
import {
  patientAppointmentDetailPath,
  patientAppointmentReschedulePath,
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
import { REQUEST_REASON_LIMITS } from '../../common/reschedule-reason-rules';
import { RESCHEDULE_TEXT } from '../../common/reschedule-text';
import {
  AppointmentSummaryCard,
  RESCHEDULE_LINK_CLASS,
  RescheduleFailureCard,
  RescheduleSubmitNotice,
} from '../../common/reschedule-views';
import { getPatientAppointment } from '../api/patient-appointment-detail-api';
import { patientRescheduleLinks } from './reschedule-links';
import type { ReschedulePreview, RescheduleResult } from './reschedule-types';
import { useReschedulePreview } from './use-reschedule-preview';
import { useSubmitReschedule } from './use-submit-reschedule';

// Cấu hình ô lý do của nhánh yêu cầu (5 đến 500 điểm mã). Hằng cấp module: không dựng lại mỗi lần vẽ.
const REQUEST_REASON = {
  label: RESCHEDULE_TEXT.reasonLabel,
  hint: RESCHEDULE_TEXT.reasonHint,
  ...REQUEST_REASON_LIMITS,
};

// Lỗi mà làm lại cũng không hết: thay cả biểu mẫu bằng thẻ kèm đường đi (không có nút gửi nữa). Còn lại (`retry`, `uncertain`, lỗi ở ô lý do) giữ biểu mẫu.
const FINAL_FAILURES: readonly RescheduleFailure['kind'][] = [
  'pickAnother',
  'backToDetail',
  'notFound',
  'session',
];

// Thẻ "Lịch hẹn" (bác sĩ, chuyên khoa, chi nhánh, người khám) từ CHI TIẾT lịch: preview không có các tên này (PLAN 5.8). Lời gọi PHỤ, không chặn: đang tải hay lỗi thì không vẽ gì và không báo lỗi (nếp F1:
// lỗi của lời gọi phụ không làm hỏng trang). Tải song song với preview.
function AppointmentSummary({ maLichHen }: { maLichHen: string }) {
  const { state } = useRemote(
    (signal) => getPatientAppointment(maLichHen, signal),
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

// Dòng nhắc của nhánh tự đổi: "còn n lần" với n = `soLanToiDa − soLanDaDoi` của MÁY CHỦ, chỉ để HIỆN (còn được tự đổi hay không do `loai` quyết). n < 1 ⇒ câu hai số của F1, không in số âm.
function remainingLine(preview: ReschedulePreview): string {
  const left = preview.soLanToiDa - preview.soLanDaDoi;
  return left >= 1
    ? RESCHEDULE_TEXT.remaining(left)
    : RESCHEDULE_TEXT.usedCount(preview.soLanDaDoi, preview.soLanToiDa);
}

type SubmitController = ReturnType<typeof useSubmitReschedule>;

function ConfirmBody({
  preview,
  khungGioId,
  maLichHen,
  submit,
  onRetry,
}: {
  preview: ReschedulePreview;
  khungGioId: string;
  maLichHen: string;
  submit: SubmitController;
  onRetry: () => void;
}) {
  const candidate = preview.lichMoi;
  const links = patientRescheduleLinks(maLichHen);
  if (!preview.choPhepDoi) {
    return (
      <BookingNotice message={rescheduleReasonMessage(preview.lyDoKhongDoi)}>
        <Link to={links.detail} className={RESCHEDULE_LINK_CLASS}>
          {RESCHEDULE_TEXT.backToDetailLink}
        </Link>
      </BookingNotice>
    );
  }
  // Có `khungGioId` thì B6 luôn trả `lichMoi` đúng khung giờ đó; thiếu hay lệch là phản hồi không dùng được (không vẽ "Lịch mới" của một khung giờ khác)
  if (candidate === null || candidate.khungGioId !== khungGioId) {
    return (
      <RescheduleFailureCard
        failure={describeRescheduleFailure(
          new UnexpectedResponseError(200),
          'load',
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
  // `loai` do MÁY CHỦ quyết; ngoại lệ duy nhất là chính máy chủ vừa đòi lý do lúc gửi (hết lần giữa hai lời gọi)
  const asRequest = preview.loai === 'GuiYeuCau' || submit.forcedRequest;
  return (
    <RescheduleConfirmForm
      current={preview.lichCu}
      next={candidate}
      intro={
        asRequest
          ? RESCHEDULE_TEXT.requestConfirmNotice
          : remainingLine(preview)
      }
      reason={asRequest ? REQUEST_REASON : null}
      reasonError={failure?.kind === 'reasonInvalid' ? failure.message : null}
      focusReasonKey={submit.reasonFocus}
      submitLabel={
        asRequest
          ? RESCHEDULE_TEXT.requestButton
          : RESCHEDULE_TEXT.confirmButton
      }
      submittingLabel={RESCHEDULE_TEXT.sending}
      submitting={submit.state.kind === 'submitting'}
      renderNotice={(submitNow) =>
        failure !== null && failure.kind !== 'reasonInvalid' ? (
          <RescheduleSubmitNotice
            failure={failure}
            onRetry={submitNow}
            uncertainLink={{
              to: links.list.to,
              label: RESCHEDULE_TEXT.myAppointments,
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
  const { state, retry } = useReschedulePreview(maLichHen, khungGioId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // `replace`: màn xác nhận đã xong việc, Back không quay về nó. Kết quả là chính trang chi tiết lịch kèm thông báo một lần (`reschedule-notice-state.ts`).
  const onDone = useCallback(
    (result: RescheduleResult) => {
      const target =
        result.ketQua === 'DaDoi' ? result.lichHenMoi.maLichHen : maLichHen;
      void navigate(patientAppointmentDetailPath(target), {
        replace: true,
        state: noticeState(result.ketQua),
      });
    },
    [maLichHen, navigate],
  );
  // Khung giờ vừa chọn không còn chọn được: về lưới (trang chọn gắn lại nên GET lại preview và lưới), kèm câu của mã đó
  const onSlotGone = useCallback(
    (maLoi: string) => {
      const notice = slotNoticeFor(maLoi);
      void navigate(patientAppointmentReschedulePath(maLichHen), {
        replace: true,
        state: notice === null ? null : noticeState(notice),
      });
    },
    [maLichHen, navigate],
  );
  const submit = useSubmitReschedule({
    maLichHen,
    khungGioId,
    onDone,
    onSlotGone,
  });
  const submitting = submit.state.kind === 'submitting';
  const links = patientRescheduleLinks(maLichHen);

  return (
    <DetailPageFrame
      backTo={links.grid}
      backLabel={RESCHEDULE_TEXT.pickAnother}
      title={RESCHEDULE_TEXT.confirmTitle}
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
            failure={describeRescheduleFailure(state.error, 'load')}
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
  const { grid } = patientRescheduleLinks(maLichHen);
  return (
    <DetailPageFrame
      backTo={grid}
      backLabel={RESCHEDULE_TEXT.pickAnother}
      title={RESCHEDULE_TEXT.confirmTitle}
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

// Màn xác nhận đổi lịch của Bệnh nhân (reschedule F2; PLAN reschedule 5.12, 5.13; 2.4.9 bước 6, 7, A1, A2). Mã lịch ở đường dẫn, `khungGioId` ở query đọc bằng `readSlotId` (id BIGINT dạng chuỗi; thiếu,
// rỗng, sai dạng hay lặp khoá ⇒ không hợp lệ): không lưu gì ở trình duyệt nên tải lại trang vẫn chạy (nếp WZ-09). Gọi preview CÓ `khungGioId` để lấy giờ mới và `hopLe` (máy chủ quyết, web không tự suy),
// rồi mới cho gửi. `key` theo cả mã lịch và id: đổi một trong hai trên URL thì reset mọi state (lý do đã gõ, lỗi của lần gửi trước). reschedule F3: thẻ lỗi và dòng lỗi lúc gửi cắt ra `common/reschedule-views.tsx`.
export function RescheduleConfirmPage() {
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
