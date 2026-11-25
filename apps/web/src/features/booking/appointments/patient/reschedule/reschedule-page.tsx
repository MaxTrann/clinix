import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  PATIENT_APPOINTMENTS_PATH,
  patientAppointmentDetailPath,
  patientAppointmentRescheduleConfirmPath,
} from '../../../../../shared/routes/booking-paths';
import { ErrorState } from '../../../../../shared/ui/error-state';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import { SlotPicker } from '../../../../search';
import { BookingNotice } from '../../../wizard/booking-notice';
import {
  classifyDetailError,
  type DetailErrorKind,
} from '../../common/error-kinds';
import { DetailPageFrame } from '../../common/detail-frame';
import { LIST_TEXT } from '../list-messages';
import { DETAIL_TEXT } from '../detail/detail-messages';
import { CurrentAppointmentCard } from './current-appointment-card';
import {
  rescheduleMessageForError,
  rescheduleReasonMessage,
} from './reschedule-errors';
import { RESCHEDULE_TEXT } from './reschedule-text';
import type { ReschedulePreview } from './reschedule-types';
import { useReschedulePreview } from './use-reschedule-preview';

const LINK_CLASS = 'mt-2 block font-medium underline';

function BackToDetail({ maLichHen }: { maLichHen: string }) {
  return (
    <Link to={patientAppointmentDetailPath(maLichHen)} className={LINK_CLASS}>
      {RESCHEDULE_TEXT.backToDetailLink}
    </Link>
  );
}

// Lỗi tải xem trước, chọn theo `maLoi` (PLAN reschedule 5.13), KHÔNG theo mã HTTP hay `thongBao`. 404 và 403 là MỘT thẻ chung (cùng thân: không lộ lịch có tồn tại hay không);
// 401 là câu phiên hết hạn. Mã nghiệp vụ của 5.13 có câu riêng: chỉ `HE_THONG_CHUA_CAU_HINH`, `HE_THONG_DANG_BAN` được "Thử lại" (cùng yêu cầu thì cùng kết quả với các mã còn lại).
// Còn lại (mạng, quá giờ, phản hồi lạ, 5xx, `maLoi` lạ) dùng `ErrorState` kèm "Thử lại" và KHÔNG lộ thông điệp máy chủ, mã nội bộ hay `requestId`.
function LoadFailure({
  error,
  maLichHen,
  onRetry,
}: {
  error: unknown;
  maLichHen: string;
  onRetry: () => void;
}) {
  const kind: DetailErrorKind = classifyDetailError(error);
  if (kind === 'notFound' || kind === 'forbidden') {
    return (
      <BookingNotice message={DETAIL_TEXT.notFound}>
        <Link to={PATIENT_APPOINTMENTS_PATH} className={LINK_CLASS}>
          {DETAIL_TEXT.backToList}
        </Link>
      </BookingNotice>
    );
  }
  if (kind === 'session') {
    return <BookingNotice message={LIST_TEXT.sessionExpired} />;
  }
  const known = rescheduleMessageForError(error);
  if (known === undefined) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  return (
    <BookingNotice message={known.message}>
      {known.retryable ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 block font-medium underline"
        >
          {RESCHEDULE_TEXT.retry}
        </button>
      ) : (
        <BackToDetail maLichHen={maLichHen} />
      )}
    </BookingNotice>
  );
}

// Dòng nói về số lần đổi: hết lần ⇒ nhắc sẽ thành yêu cầu cho Lễ tân; còn lần ⇒ hai số lấy NGUYÊN từ máy chủ (không tính "còn n lần" ở client)
function CountNotice({ preview }: { preview: ReschedulePreview }) {
  return (
    <p className="rounded-xl border border-cyan-200 bg-brand-soft px-4 py-3 text-sm text-cyan-900">
      {preview.loai === 'GuiYeuCau'
        ? RESCHEDULE_TEXT.requestNotice
        : RESCHEDULE_TEXT.usedCount(preview.soLanDaDoi, preview.soLanToiDa)}
    </p>
  );
}

function RescheduleReady({
  preview,
  maLichHen,
}: {
  preview: ReschedulePreview;
  maLichHen: string;
}) {
  const navigate = useNavigate();
  // Chốt chọn MỘT lần: route đích là `lazy` nên trang chọn còn nằm đó trong lúc nạp, bấm đúp không được đẩy hai lần điều hướng (WDH-19)
  const picked = useRef(false);
  const onSelect = useCallback(
    (slot: { khungGioId: string }) => {
      if (picked.current) return;
      picked.current = true;
      void navigate(
        patientAppointmentRescheduleConfirmPath(maLichHen, slot.khungGioId),
      );
    },
    [maLichHen, navigate],
  );

  if (!preview.choPhepDoi) {
    return (
      <BookingNotice message={rescheduleReasonMessage(preview.lyDoKhongDoi)}>
        <BackToDetail maLichHen={maLichHen} />
      </BookingNotice>
    );
  }
  return (
    <div className="mt-5 flex flex-col gap-4">
      <CurrentAppointmentCard current={preview.lichCu} />
      <CountNotice preview={preview} />
      <section
        aria-labelledby="reschedule-pick-title"
        className="rounded-2xl border border-gray-200 bg-white p-5"
      >
        <h2
          id="reschedule-pick-title"
          className="text-sm font-semibold text-gray-900"
        >
          {RESCHEDULE_TEXT.pickTitle}
        </h2>
        <p className="mt-1 mb-4 text-xs text-gray-600">
          {RESCHEDULE_TEXT.pickHint}
        </p>
        <SlotPicker bacSiId={preview.lichCu.bacSiId} onSelect={onSelect} />
      </section>
    </div>
  );
}

function Reschedule({ maLichHen }: { maLichHen: string }) {
  const { state, retry } = useReschedulePreview(maLichHen, null);
  // Vào trang (và quay lại từ màn xác nhận) thì tiêu điểm về tiêu đề trang, không để rơi về `body` (WDH-08)
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <DetailPageFrame
      backTo={patientAppointmentDetailPath(maLichHen)}
      backLabel={RESCHEDULE_TEXT.backToDetail}
      title={RESCHEDULE_TEXT.title}
      headingRef={headingRef}
    >
      {state.status === 'loading' && (
        <LoadingState message={RESCHEDULE_TEXT.loading} />
      )}
      {state.status === 'error' && (
        <LoadFailure
          error={state.error}
          maLichHen={maLichHen}
          onRetry={retry}
        />
      )}
      {state.status === 'ready' && (
        <RescheduleReady preview={state.data} maLichHen={maLichHen} />
      )}
    </DetailPageFrame>
  );
}

// Trang chọn khung giờ mới để đổi lịch của Bệnh nhân (reschedule F1; PLAN reschedule 5.12). GET xem trước (không `khungGioId`) rồi mới vẽ lưới của ĐÚNG bác sĩ của lịch (`lichCu.bacSiId`);
// chọn ô chỉ ĐIỀU HƯỚNG sang màn xác nhận (thân do F2), không gọi API ghi. `key={maLichHen}`: đổi mã trên URL (cùng component) thì reset mọi state. Dữ liệu chỉ ở state của trang:
// không kho trình duyệt, tải lại là GET lại; ô nào chọn được do MÁY CHỦ quyết (trạng thái ô), web không tự suy.
export function ReschedulePage() {
  const { maLichHen = '' } = useParams();
  return <Reschedule key={maLichHen} maLichHen={maLichHen} />;
}
