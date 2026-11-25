import { useCallback } from 'react';
import type { RescheduleDone } from '../../common/reschedule-payload';
import { useRescheduleSubmit } from '../../common/use-reschedule-submit';
import { submitReceptionReschedule } from './reception-reschedule-api';
import { RECEPTION_FAILURE_CONTEXT } from './reception-reschedule-text';

interface UseReceptionRescheduleSubmitOptions {
  maLichHen: string;
  khungGioId: string;
  // 201: trang điều hướng sang chi tiết lịch MỚI (WDO-04)
  onDone: (result: RescheduleDone) => void;
  // Khung giờ vừa bị đặt, giữ, qua giờ hay biến mất: trang về lưới và tải lại lưới (WDO-05)
  onSlotGone: (maLoi: string) => void;
}

// Vỏ MỎNG của Lễ tân trên hook lõi `useRescheduleSubmit` (reschedule F3; WDO-04, WDO-06): chốt một lần, hạ chốt ở `finally`, cờ còn gắn trang, "chưa rõ" đều ở hook lõi (đã có test và đột biến từ F2). Chỉ có ở đây: gọi
// `submitReceptionReschedule` với thân `{ khungGioId, lyDo }` và ngữ cảnh lỗi của Lễ tân.
export function useReceptionRescheduleSubmit({
  maLichHen,
  khungGioId,
  onDone,
  onSlotGone,
}: UseReceptionRescheduleSubmitOptions) {
  const send = useCallback(
    // Ô lý do của Lễ tân luôn BẮT BUỘC nên form chỉ gọi với một chuỗi đã chuẩn hoá; `null` không xảy ra (nếu có, máy chủ trả 400 `LY_DO_BAT_BUOC` và lỗi hiện cạnh ô)
    (reason: string | null) =>
      submitReceptionReschedule(maLichHen, {
        khungGioId,
        lyDo: reason ?? '',
      }),
    [maLichHen, khungGioId],
  );
  return useRescheduleSubmit<RescheduleDone>({
    send,
    context: RECEPTION_FAILURE_CONTEXT,
    onDone,
    onSlotGone,
  });
}
