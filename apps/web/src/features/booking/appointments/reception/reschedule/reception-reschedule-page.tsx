import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { receptionAppointmentRescheduleConfirmPath } from '../../../../../shared/routes/booking-paths';
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
import { receptionRescheduleLinks } from './reception-reschedule-links';
import { RECEPTION_RESCHEDULE_TEXT } from './reception-reschedule-text';
import type { ReceptionReschedulePreview } from './reception-reschedule-types';
import { useReceptionReschedulePreview } from './use-reception-reschedule-preview';

function RescheduleReady({
  preview,
  maLichHen,
}: {
  preview: ReceptionReschedulePreview;
  maLichHen: string;
}) {
  const navigate = useNavigate();
  // Chốt chọn MỘT lần: route đích là `lazy` nên trang chọn còn nằm đó trong lúc nạp, bấm đúp không được đẩy hai lần điều hướng (WDO-02)
  const picked = useRef(false);
  const onSelect = useCallback(
    (slot: { khungGioId: string }) => {
      if (picked.current) return;
      picked.current = true;
      void navigate(
        receptionAppointmentRescheduleConfirmPath(maLichHen, slot.khungGioId),
      );
    },
    [maLichHen, navigate],
  );

  if (!preview.choPhepDoi) {
    return (
      <BookingNotice message={rescheduleReasonMessage(preview.lyDoKhongDoi)}>
        <Link
          to={receptionRescheduleLinks(maLichHen).detail}
          className={RESCHEDULE_LINK_CLASS}
        >
          {RESCHEDULE_TEXT.backToDetailLink}
        </Link>
      </BookingNotice>
    );
  }
  return (
    <div className="mt-5 flex flex-col gap-4">
      <CurrentAppointmentCard current={preview.lichCu} />
      <ReschedulePickSection>
        <SlotPicker bacSiId={preview.lichCu.bacSiId} onSelect={onSelect} />
      </ReschedulePickSection>
    </div>
  );
}

function Reschedule({ maLichHen }: { maLichHen: string }) {
  const { state, retry } = useReceptionReschedulePreview(maLichHen, null);
  // Vào trang (và quay lại từ màn xác nhận) thì tiêu điểm về tiêu đề trang, không để rơi về `body`
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  // Về từ màn xác nhận vì khung giờ vừa chọn không còn chọn được: câu của mã đó, MỘT lần (trang gắn lại nên preview và lưới đã tải lại)
  const slotNotice = useOneShotNotice(SLOT_NOTICES);
  const links = receptionRescheduleLinks(maLichHen);

  return (
    <DetailPageFrame
      backTo={links.detail}
      backLabel={RESCHEDULE_TEXT.backToDetail}
      title={RECEPTION_RESCHEDULE_TEXT.title}
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

// Trang chọn khung giờ mới để Lễ tân ĐỔI LỊCH HỘ bệnh nhân (reschedule F3, WDO-02; PLAN reschedule 5.12). GET xem trước (không `khungGioId`) rồi mới vẽ lưới của ĐÚNG bác sĩ của lịch (`lichCu.bacSiId`); chọn ô
// chỉ ĐIỀU HƯỚNG sang màn xác nhận, không gọi API ghi. Cùng bộ chọn `SlotPicker` và cùng khung với trang của Bệnh nhân (F1). `key={maLichHen}`: đổi mã trên URL thì reset mọi state. Dữ liệu chỉ ở state của trang:
// không kho trình duyệt, tải lại là GET lại; ô nào chọn được do MÁY CHỦ quyết (trạng thái ô), web không tự suy. Lịch ngoài chi nhánh hay không có ⇒ 404 `KHONG_TIM_THAY` MỘT thẻ chung.
export function ReceptionReschedulePage() {
  const { maLichHen = '' } = useParams();
  return <Reschedule key={maLichHen} maLichHen={maLichHen} />;
}
