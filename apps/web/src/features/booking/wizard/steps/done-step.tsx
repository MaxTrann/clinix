import { StepPlaceholder } from './step-placeholder';

interface DoneStepProps {
  maLichHen: string;
}

// THÂN TẠM Bước 6 "Hoàn tất" (booking F3). Việc của F7 (Figma `453:2`): phiếu từ `GET /patient/appointments/:maLichHen`.
export function DoneStep({ maLichHen }: DoneStepProps) {
  return <StepPlaceholder step={6} reference={maLichHen} />;
}
