import { useRemote } from '../../../../../shared/hooks/use-remote';
import { getReschedulePreview } from './reschedule-preview-api';

/**
 * Xem trước đổi lịch (reschedule F1; F2 dùng lại với `khungGioId`). Dựng trên `useRemote`: đổi mã lịch hay `khungGioId` ⇒ gọi lại và huỷ yêu cầu cũ, kết quả muộn không ghi đè,
 * và trạng thái là `loading` ngay (kết quả của lịch trước không bao giờ hiện cho lịch mới). `khungGioId = null` ⇒ chỉ hỏi điều kiện đổi (PLAN 5.8). `retry` chạy lại lần gọi hiện tại.
 */
export function useReschedulePreview(
  maLichHen: string,
  khungGioId: string | null,
) {
  return useRemote(
    (signal) => getReschedulePreview(maLichHen, khungGioId, signal),
    [maLichHen, khungGioId],
  );
}
