import { useRemote } from '../../../../shared/hooks/use-remote';
import {
  getDoctorOptions,
  getRelativeOptions,
  getSpecialtyOptions,
} from './api/filter-options-api';

// Ba danh sách cho các ô lọc, tải ĐỘC LẬP một lần khi vào trang (booking F1; Đại duyệt 12/11/2026, câu (c)): lỗi một danh sách chỉ làm ô đó còn
// `Tất cả` kèm câu nhỏ và `Thử lại`, không chặn bảng lịch hẹn. `deps` rỗng nên chỉ tải lại khi `retry`.
export function useFilterOptions() {
  return {
    relatives: useRemote(getRelativeOptions, []),
    specialties: useRemote(getSpecialtyOptions, []),
    doctors: useRemote(getDoctorOptions, []),
  };
}

export type FilterOptionsController = ReturnType<typeof useFilterOptions>;
