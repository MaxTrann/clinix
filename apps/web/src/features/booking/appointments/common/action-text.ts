// Chữ dùng chung của các thao tác đổi trạng thái lịch hẹn (booking F9 viết trong `reception/detail/detail-messages.ts`, chuyển lên `common/` ở F10 để hộp override của Quản trị viên
// dùng lại; Lễ tân trải `COMMON_ACTION_TEXT` vào `ACTION_TEXT` của mình nên mọi chỗ đọc `ACTION_TEXT.x` cũ vẫn chạy). Chữ lấy từ PLAN 5.14 khi có.
export const COMMON_ACTION_TEXT = {
  reload: 'Tải lại chi tiết',
  close: 'Đóng',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  notFound: 'Không tìm thấy lịch hẹn này.',
  // PLAN 5.14 `LY_DO_BAT_BUOC`
  reasonRequired: 'Vui lòng nhập lý do (tối đa 255 ký tự).',
  // PLAN 5.14 `CHI_BAC_SI_HOAN_THANH`
  onlyDoctorCompletes:
    'Trạng thái Hoàn thành chỉ do Bác sĩ chuyển sau khi hoàn tất ca khám.',
  notConfigured:
    'Hệ thống chưa được cấu hình nên chưa thể thực hiện thao tác này.',
  transitionUnknown:
    'Không thể thực hiện thao tác này với trạng thái hiện tại của lịch hẹn.',
} as const;

export const transitionLabel = (from: string, to: string) =>
  `Không thể chuyển lịch hẹn từ ${from} sang ${to}.`;
export const alreadyInStateLabel = (state: string) =>
  `Lịch hẹn đã ở trạng thái ${state}.`;
