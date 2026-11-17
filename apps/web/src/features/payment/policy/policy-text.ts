// Chữ của màn "Đặt cọc & Hoàn tiền" (payment F5). Có trong Figma `553:2`, `569:2` trừ các câu ghi [đề xuất] (khung sửa chính sách riêng và các trạng thái chưa có frame, PLAN 4.5).
export const POLICY_TEXT = {
  pageTitle: 'Đặt cọc & Hoàn tiền',

  defaultTitle: 'Chính sách hủy / hoàn mặc định',
  defaultScope: 'Toàn hệ thống',
  cancelBefore: 'Hủy trước (giờ)',
  refund: 'Hoàn cọc',
  defaultNote:
    'Các dịch vụ không có chính sách riêng sẽ dùng bảng này. Lịch đã đặt dùng snapshot tại thời điểm đặt.',

  servicesTitle: 'Dịch vụ',
  servicesSubtitle: 'Chọn để xem / chỉnh chính sách riêng',
  defaultBadge: 'Mặc định',
  // [đề xuất] Figma chỉ có nhãn "Mặc định" (Trung chọn 18/11/2026)
  customBadge: 'Riêng',
  depositShort: 'Cọc',
  emptyPanel:
    'Chọn một dịch vụ bên trái để xem / chỉnh đặt cọc và chính sách riêng',

  // [đề xuất] Khung sửa chính sách riêng: Figma chưa có frame, dùng kiểu ô và nút của `569:316`
  price: 'Giá',
  depositLabel: 'Mức đặt cọc',
  depositHint: 'Số nguyên đồng; 0 là không đặt cọc. Tối đa bằng giá dịch vụ.',
  tiersTitle: 'Chính sách hủy / hoàn',
  rateLabel: 'Hoàn cọc (%)',
  applyTemplate: 'Áp dụng bảng mẫu',
  addTier: 'Thêm mốc',
  removeTier: (index: number) => `Xoá mốc ${index + 1}`,
  hoursOf: (index: number) => `Hủy trước (giờ) của mốc ${index + 1}`,
  rateOf: (index: number) => `Hoàn cọc (%) của mốc ${index + 1}`,
  noTiers: 'Chưa có mốc nào.',
  noRefundWarning:
    'Có đặt cọc nhưng chưa có mốc hoàn nào: Bệnh nhân hủy lịch sẽ không được hoàn cọc.',
  save: 'Lưu',
  saving: 'Đang lưu…',
  cancel: 'Hủy',
  saved: 'Đã lưu chính sách của dịch vụ.',
  editorLoading: 'Đang tải chính sách của dịch vụ…',
  listLoading: 'Đang tải danh sách dịch vụ…',
  listEmpty: 'Chưa có dịch vụ khám nào.',
  notFound: 'Dịch vụ không còn tồn tại. Hãy tải lại danh sách.',
} as const;
