import { StepPlaceholder } from './step-placeholder';

interface InfoStepProps {
  // Khung giờ đã được kiểm đúng dạng; cổng A4 đã cho qua. F4 thay file này: chọn hồ sơ đi khám, lý do khám, rồi `setDraft` ở
  // `useBookingDraft()` và chuyển sang `bookingConfirmPath(khungGioId)`.
  khungGioId: string;
}

// THÂN TẠM Bước 4 "Người khám" (booking F3). Việc của F4 (Figma `449:2`, `450:2`).
export function InfoStep({ khungGioId }: InfoStepProps) {
  return <StepPlaceholder step={4} reference={khungGioId} />;
}
