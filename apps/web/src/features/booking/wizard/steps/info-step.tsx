import { InfoForm } from '../info/info-form';

interface InfoStepProps {
  // Khung giờ đã được kiểm đúng dạng; cổng A4 đã cho qua (khung wizard của F3)
  khungGioId: string;
}

// Bước 4 "Người khám" (booking F4, Figma `449:2`, `450:2`): chọn hồ sơ đi khám, lý do khám, khối "Lịch hẹn đang chọn", rồi `setDraft` ở `useBookingDraft()` và chuyển
// sang `bookingConfirmPath(khungGioId)`. `key={khungGioId}`: đổi khung giờ ngay trên cùng route (React Router giữ nguyên component) thì form và hồ sơ đang chọn
// đặt lại, lý do khám của khung giờ trước không sang khung giờ sau.
export function InfoStep({ khungGioId }: InfoStepProps) {
  return <InfoForm key={khungGioId} khungGioId={khungGioId} />;
}
