import { useRemote } from '../../../../shared/hooks/use-remote';
import {
  getDoctorOptions,
  getSpecialtyOptions,
} from '../common/filter-options-api';

// Hai danh sách cho các ô lọc Bác sĩ và Chuyên khoa, tải ĐỘC LẬP một lần khi vào trang (booking F8, như `use-filter-options.ts` của "Lịch hẹn của tôi"): lỗi một
// danh sách chỉ làm ô đó còn `Tất cả` kèm câu nhỏ và `Thử lại`, không chặn bảng. Nguồn là hai route công khai, KHÔNG giới hạn theo chi nhánh của Lễ tân `[cần điền]`:
// chọn bác sĩ ở chi nhánh khác cho kết quả rỗng (backend ép theo chi nhánh của Lễ tân). `deps` rỗng nên chỉ tải lại khi `retry`.
export function useFilterOptions() {
  return {
    specialties: useRemote(getSpecialtyOptions, []),
    doctors: useRemote(getDoctorOptions, []),
  };
}

export type FilterOptionsController = ReturnType<typeof useFilterOptions>;
