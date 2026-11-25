import { useRemote } from '../../../../../shared/hooks/use-remote';
import { getDoctorOptions } from '../filter-options-api';

// Danh sách bác sĩ cho ô lọc của trang yêu cầu đổi lịch (reschedule F4), tải MỘT lần khi vào trang từ route công khai `public/doctors` (cùng nguồn với "Quản lý lịch hẹn"; tối đa 100 bác sĩ đầu, có cờ
// `truncated`; bác sĩ đã ngừng hoạt động không có trong danh sách). Lỗi chỉ làm ô lọc còn `Tất cả` kèm `Thử lại`, không chặn bảng. `deps` rỗng nên chỉ tải lại khi `retry`.
export function useDoctorOptions() {
  return useRemote(getDoctorOptions, []);
}
