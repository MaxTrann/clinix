import { useRemote } from '../../../../shared/hooks/use-remote';
import type { BranchOption, OptionList } from '../common/filter-option-types';
import {
  getBranchOptions,
  getDoctorOptions,
  getServiceOptions,
  getSpecialtyOptions,
} from '../common/filter-options-api';

// Bốn danh sách cho các ô lọc Chuyên khoa, Bác sĩ, Loại dịch vụ và Chi nhánh, tải ĐỘC LẬP một lần khi vào trang (booking F10, như `use-filter-options.ts` của Lễ tân): lỗi một danh sách
// chỉ làm ô đó còn `Tất cả` kèm câu nhỏ và `Thử lại`, không chặn bảng. Nguồn là các route công khai, KHÔNG giới hạn theo chi nhánh `[đề xuất]`. Danh sách chi nhánh CHỈ gọi khi
// Quản trị viên là Toàn hệ thống (Chi nhánh thì ô chi nhánh là chữ cố định: không có lời gọi nào). `deps` cố định nên chỉ tải lại khi `retry`.
const NO_BRANCHES: OptionList<BranchOption> = { options: [], truncated: false };

export function useAdminFilterOptions(allowBranch: boolean) {
  return {
    specialties: useRemote(getSpecialtyOptions, []),
    doctors: useRemote(getDoctorOptions, []),
    services: useRemote(getServiceOptions, []),
    branches: useRemote(
      (signal) =>
        allowBranch ? getBranchOptions(signal) : Promise.resolve(NO_BRANCHES),
      [allowBranch ? 1 : 0],
    ),
  };
}

export type AdminFilterOptionsController = ReturnType<
  typeof useAdminFilterOptions
>;
