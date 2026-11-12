import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import {
  BOOKING_PATH,
  bookingInfoPath,
} from '../../../shared/routes/booking-paths';
import { BookingNotice } from './booking-notice';
import { useBookingDraft } from './booking-draft-context';
import { EligibilityGate } from './eligibility-gate';
import { readSlotId } from './slot-id';
import { ConfirmStep } from './steps/confirm-step';
import { DoneStep } from './steps/done-step';
import { InfoStep } from './steps/info-step';
import { PaymentStep } from './steps/payment-step';
import { WizardFrame } from './wizard-frame';

// Bốn trang của Bước 4–6. Mỗi trang = khung (thanh bước, đọc id, cổng, bản nháp) của F3 + MỘT thân ở `steps/` của F4 đến F7.
// KHÔNG trang nào gọi API ghi hay giữ chỗ khi vừa mở: chỉ F5 gọi `POST /booking/appointments`, và chỉ khi người dùng bấm nút (A1/1–8).

// Liên kết về Bước 1: luôn dựng được. Bước 2, 3 chưa có (URL chỉ mang `khungGioId`, TRACKING 3.22 (k)).
const BACK_TO_START = { 1: BOOKING_PATH } as const;

function InvalidSlotNotice() {
  return (
    <BookingNotice message="Liên kết chọn khung giờ không hợp lệ.">
      <Link to={BOOKING_PATH} className="mt-2 block font-medium underline">
        Chọn lại dịch vụ
      </Link>
    </BookingNotice>
  );
}

function useSlotId(): string | null {
  const [params] = useSearchParams();
  return readSlotId(params);
}

// Bước 4 "Người khám": đúng khung giờ trên URL, rồi cổng A4
export function BookingInfoPage() {
  const khungGioId = useSlotId();
  return (
    <WizardFrame step={4} links={BACK_TO_START}>
      {khungGioId === null ? (
        <InvalidSlotNotice />
      ) : (
        <EligibilityGate>
          <InfoStep khungGioId={khungGioId} />
        </EligibilityGate>
      )}
    </WizardFrame>
  );
}

// Bước 5 "Xác nhận": cần bản nháp của Bước 4 cho ĐÚNG khung giờ này. Mở thẳng hay tải lại thì không có (chỉ ở bộ nhớ) ⇒ về Bước 4.
export function BookingConfirmPage() {
  const khungGioId = useSlotId();
  const { draft } = useBookingDraft();

  if (khungGioId === null) {
    return (
      <WizardFrame step={5} links={BACK_TO_START}>
        <InvalidSlotNotice />
      </WizardFrame>
    );
  }
  if (draft === null || draft.khungGioId !== khungGioId) {
    return <Navigate to={bookingInfoPath(khungGioId)} replace />;
  }
  return (
    <WizardFrame
      step={5}
      links={{ ...BACK_TO_START, 4: bookingInfoPath(khungGioId) }}
    >
      <ConfirmStep khungGioId={khungGioId} draft={draft} />
    </WizardFrame>
  );
}

// Thanh toán vẫn là bước 5 trên thanh bước (Figma `452:2`). Lịch đã có nên KHÔNG qua cổng A4 (Q26); dữ liệu luôn tải từ API theo mã.
export function BookingPaymentPage() {
  const { maLichHen = '' } = useParams();
  return (
    <WizardFrame step={5} links={BACK_TO_START}>
      <PaymentStep maLichHen={maLichHen} />
    </WizardFrame>
  );
}

// Bước 6 "Hoàn tất": Figma `453:2` không có nút "Quay lại" nào, nên không đường dẫn nào
export function BookingDonePage() {
  const { maLichHen = '' } = useParams();
  return (
    <WizardFrame step={6}>
      <DoneStep maLichHen={maLichHen} />
    </WizardFrame>
  );
}
