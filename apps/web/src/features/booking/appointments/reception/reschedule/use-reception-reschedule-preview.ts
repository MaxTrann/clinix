import { useRemote } from '../../../../../shared/hooks/use-remote';
import { getReceptionReschedulePreview } from './reception-reschedule-api';

/**
 * Xem trước đổi lịch hộ (reschedule F3; WDO-02, WDO-03). Dựng trên `useRemote`: đổi mã lịch hay `khungGioId` ⇒ gọi lại và huỷ yêu cầu cũ, kết quả muộn không ghi đè, và trạng thái là `loading` ngay (kết quả của
 * lịch trước không bao giờ hiện cho lịch mới). `khungGioId = null` ⇒ chỉ hỏi điều kiện đổi (trang chọn khung giờ). `retry` chạy lại lần gọi hiện tại.
 */
export function useReceptionReschedulePreview(
  maLichHen: string,
  khungGioId: string | null,
) {
  return useRemote(
    (signal) => getReceptionReschedulePreview(maLichHen, khungGioId, signal),
    [maLichHen, khungGioId],
  );
}
