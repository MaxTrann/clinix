import { Link, Outlet, useSearchParams } from 'react-router';
import { bookingInfoPath } from '../../../shared/routes/booking-paths';
import { useBookingDraft } from '../wizard/booking-draft-context';
import { BookingDraftProvider } from '../wizard/booking-draft-provider';
import { readSlotId } from '../wizard/slot-id';
import { InfoStep } from '../wizard/steps/info-step';
import { LocationProbe } from './location-probe';

// Ba thành phần của `info-step-harness.tsx` (booking F4). Tách file riêng vì `react-refresh/only-export-components` không cho một file vừa xuất hàm dựng (`renderInfoStep`)
// vừa khai báo component. Chỉ test dùng.

// Bản nháp và bộ dò URL nằm ở khung chung của hai bước, như `BookingWizardLayout` của F3
export function HarnessLayout() {
  return (
    <BookingDraftProvider>
      <Outlet />
      <LocationProbe />
    </BookingDraftProvider>
  );
}

// Phía Bước 4: kèm liên kết sang khung giờ khác để mô phỏng đổi `khungGioId` ngay trên cùng route
export function InfoRoute() {
  const [params] = useSearchParams();
  const khungGioId = readSlotId(params);
  return (
    <>
      {khungGioId !== null && <InfoStep khungGioId={khungGioId} />}
      <Link to={bookingInfoPath('6')}>Sang khung giờ 6</Link>
    </>
  );
}

// Phía Bước 5: hiện bản nháp nguyên văn và liên kết "Sửa" về Bước 4
export function ConfirmProbe() {
  const { draft } = useBookingDraft();
  return (
    <>
      <output data-testid="draft">{JSON.stringify(draft)}</output>
      <Link to={bookingInfoPath('5')}>Sửa</Link>
    </>
  );
}
