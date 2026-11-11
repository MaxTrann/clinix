import { StepPlaceholder } from './step-placeholder';

interface PaymentStepProps {
  maLichHen: string;
}

// THÂN TẠM Bước Thanh toán (booking F3; vẫn là bước 5 "Xác nhận" trên thanh bước, Figma `452:2`). Việc của F6: tải
// `GET /patient/appointments/:maLichHen`, đếm ngược theo giờ máy chủ; thân thanh toán là của module `payment`.
export function PaymentStep({ maLichHen }: PaymentStepProps) {
  return <StepPlaceholder step={5} reference={maLichHen} />;
}
