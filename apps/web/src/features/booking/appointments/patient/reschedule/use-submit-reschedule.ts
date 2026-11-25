import { useCallback } from 'react';
import { PATIENT_FAILURE_CONTEXT } from '../../common/reschedule-failure';
import { useRescheduleSubmit } from '../../common/use-reschedule-submit';
import { submitReschedule } from './reschedule-submit-api';
import type { RescheduleResult } from './reschedule-types';

interface UseSubmitRescheduleOptions {
  maLichHen: string;
  khungGioId: string;
  // 201: trang điều hướng sang chi tiết lịch (WDH-05)
  onDone: (result: RescheduleResult) => void;
  // Khung giờ vừa bị đặt, giữ, qua giờ hay biến mất: trang về lưới và tải lại lưới (WDH-06)
  onSlotGone: (maLoi: string) => void;
}

// Vỏ MỎNG của Bệnh nhân trên hook lõi `useRescheduleSubmit` (reschedule F3 chuyển phần chốt một lần, hạ chốt ở `finally`, cờ còn gắn trang, "chưa rõ" lên `common/` để Lễ tân đổi hộ dùng lại; hành vi của
// Bệnh nhân KHÔNG đổi, các ca WDH-05, WDH-07, WDH-39, WDH-46, WDH-47 chạy nguyên văn). Chỉ có ở đây: gọi `submitReschedule` của Bệnh nhân với thân `{ khungGioId }` hoặc `{ khungGioId, lyDoYeuCau }`.
export function useSubmitReschedule({
  maLichHen,
  khungGioId,
  onDone,
  onSlotGone,
}: UseSubmitRescheduleOptions) {
  const send = useCallback(
    (reason: string | null) =>
      submitReschedule(
        maLichHen,
        reason === null ? { khungGioId } : { khungGioId, lyDoYeuCau: reason },
      ),
    [maLichHen, khungGioId],
  );
  return useRescheduleSubmit<RescheduleResult>({
    send,
    context: PATIENT_FAILURE_CONTEXT,
    onDone,
    onSlotGone,
  });
}
