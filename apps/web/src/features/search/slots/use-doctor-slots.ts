import { ApiError } from '../../../shared/api/errors';
import { useRemote } from '../../../shared/hooks/use-remote';
import { getDoctorSlots } from '../api/search-service';
import { SLOT_DATE_ERROR_CODES, type DoctorSlotsById } from '../api/slot-types';

const NO_DOCTORS: DoctorSlotsById = new Map();

/**
 * Khung giờ của CẢ trang bác sĩ cho MỘT ngày bằng đúng MỘT lời gọi (T4; không N+1). Dựng trên `useRemote`: đổi `ngay` hoặc danh sách id ⇒ gọi lại và
 * huỷ yêu cầu cũ, kết quả muộn không ghi đè (và bộ đọc từ chối phản hồi của ngày khác); `retry` chạy lại lần gọi hiện tại.
 * Lỗi của lưới giờ là trạng thái RIÊNG: danh sách bác sĩ đã tải xong vẫn hiện. Không có bác sĩ nào ⇒ không gọi mạng.
 */
export function useDoctorSlots(ids: readonly string[], ngay: string) {
  return useRemote(
    async (signal) =>
      ids.length === 0
        ? NO_DOCTORS
        : getDoctorSlots({ bacSiIds: ids, ngay }, signal),
    [ids.join(','), ngay],
  );
}

/**
 * 400 `BO_LOC_KHONG_HOP_LE` có lỗi ở trường `ngay`: ngày đã chọn không còn nằm trong [hôm nay, hôm nay + 6] (để trang mở qua nửa đêm) hoặc đồng hồ
 * máy lệch. Giao diện hiện nút "Xem lịch hôm nay" thay vì "Thử lại" (thử lại cùng ngày sẽ lại 400).
 */
export function isSlotDateError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    (error.loi ?? []).some(
      (item) =>
        item.truong === 'ngay' &&
        SLOT_DATE_ERROR_CODES.some((code) => code === item.ma),
    )
  );
}
