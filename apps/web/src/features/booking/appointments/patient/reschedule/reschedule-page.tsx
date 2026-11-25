import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { patientAppointmentRescheduleConfirmPath } from '../../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import { SlotPicker } from '../../../../search';
import { BookingNotice } from '../../../wizard/booking-notice';
import { CurrentAppointmentCard } from '../../common/current-appointment-card';
import { DetailPageFrame } from '../../common/detail-frame';
import {
  rescheduleMessageForCode,
  rescheduleReasonMessage,
} from '../../common/reschedule-errors';
import {
  SLOT_NOTICES,
  useOneShotNotice,
} from '../../common/reschedule-notice-state';
import { RESCHEDULE_TEXT } from '../../common/reschedule-text';
import {
  RESCHEDULE_LINK_CLASS,
  RescheduleLoadFailure,
  ReschedulePickSection,
} from '../../common/reschedule-views';
import { patientRescheduleLinks } from './reschedule-links';
import type { ReschedulePreview } from './reschedule-types';
import { useReschedulePreview } from './use-reschedule-preview';

function BackToDetail({ maLichHen }: { maLichHen: string }) {
  return (
    <Link
      to={patientRescheduleLinks(maLichHen).detail}
      className={RESCHEDULE_LINK_CLASS}
    >
      {RESCHEDULE_TEXT.backToDetailLink}
    </Link>
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
      <ReschedulePickSection>
        <SlotPicker bacSiId={preview.lichCu.bacSiId} onSelect={onSelect} />
      </ReschedulePickSection>
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
  // Về từ màn xác nhận vì khung giờ vừa chọn không còn chọn được (reschedule F2, WDH-43): câu của mã đó, MỘT lần (trang gắn lại nên preview và lưới đã tải lại)
  const slotNotice = useOneShotNotice(SLOT_NOTICES);
  const links = patientRescheduleLinks(maLichHen);

  return (
    <DetailPageFrame
      backTo={links.detail}
      backLabel={RESCHEDULE_TEXT.backToDetail}
      title={RESCHEDULE_TEXT.title}
      headingRef={headingRef}
    >
      {slotNotice !== null && (
        <BookingNotice
          message={
            rescheduleMessageForCode(slotNotice)?.message ??
            RESCHEDULE_TEXT.slotNotUsable
          }
        />
      )}
      {state.status === 'loading' && (
        <LoadingState message={RESCHEDULE_TEXT.loading} />
      )}
      {state.status === 'error' && (
        <RescheduleLoadFailure
          error={state.error}
          links={links}
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
// không kho trình duyệt, tải lại là GET lại; ô nào chọn được do MÁY CHỦ quyết (trạng thái ô), web không tự suy. reschedule F3: thẻ lỗi tải và khung "Chọn khung giờ mới" cắt ra `common/reschedule-views.tsx`.
export function ReschedulePage() {
  const { maLichHen = '' } = useParams();
  return <Reschedule key={maLichHen} maLichHen={maLichHen} />;
}
