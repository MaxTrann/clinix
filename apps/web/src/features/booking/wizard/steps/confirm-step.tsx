import type { BookingDraft } from '../booking-draft-context';
import { StepPlaceholder } from './step-placeholder';

interface ConfirmStepProps {
  khungGioId: string;
  // Bản nháp của Bước 4, đã kiểm đúng khung giờ này (khung wizard đưa về Bước 4 nếu thiếu hay lệch)
  draft: BookingDraft;
}

// THÂN TẠM Bước 5 "Xác nhận" (booking F3). Việc của F5 (Figma `451:2`): `POST /booking/checks` lấy tóm tắt, nút gọi
// `POST /booking/appointments` (chỉ khi người dùng bấm), xử lý lỗi theo `maLoi`, chống bấm đúp, `usePageActive`.
export function ConfirmStep({ khungGioId }: ConfirmStepProps) {
  return <StepPlaceholder step={5} reference={khungGioId} />;
}
