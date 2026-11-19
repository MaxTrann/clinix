// Chữ của ô ngày `DateField` (doctor UX1, G5). Ở file riêng vì file component chỉ được export component (quy tắc fast refresh).
// `[đề xuất]`: chờ nhóm duyệt cùng bộ chữ của form.
export const DATE_TEXT = {
  placeholder: 'dd/mm/yyyy',
  pickerLabel: 'Chọn ngày',
  invalid: 'Ngày không tồn tại.',
} as const;
