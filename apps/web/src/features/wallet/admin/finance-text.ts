// Chữ của màn "Quản lý tài chính ví" (payment F7). Có trong Figma `549:2`, `566:2`, `567:2`, `581:2` trừ các câu ghi [đề xuất] (PLAN 4.5).
export const FINANCE_TEXT = {
  title: 'Quản lý tài chính ví',
  subtitle: 'Rút tiền, hoàn tiền đặc biệt và cộng ví thủ công',
  tabWithdrawals: 'Yêu cầu rút tiền',
  tabSpecialRefunds: 'Hoàn tiền đặc biệt',
  tabUnpostedTopups: 'Nạp ví chưa cộng',
  // [đề xuất] Hai tab do F8, F9 làm
  tabComingSoon: 'Chức năng đang được phát triển.',

  filterLabel: 'Lọc theo trạng thái',
  filterAll: 'Tất cả',
  tableLabel: 'Danh sách yêu cầu rút tiền',
  columnPatient: 'Bệnh nhân',
  columnAmount: 'Số tiền',
  columnSentAt: 'Thời gian gửi',
  columnHandledAt: 'Xử lý lúc',
  columnStatus: 'Trạng thái',
  details: 'Chi tiết',
  detailsOf: (name: string) => `Chi tiết yêu cầu của ${name}`,

  detailTitle: 'Chi tiết yêu cầu rút tiền',
  requestCode: (code: string) => `Mã yêu cầu ${code}`,
  amountRequested: 'Số tiền yêu cầu',
  status: 'Trạng thái',
  sentAt: 'Thời gian gửi',
  handledAt: 'Xử lý lúc',
  walletTitle: 'Ví của bệnh nhân',
  // Trung chốt 19/11/2026: chỉ hai số máy chủ trả; bỏ "Khả dụng" và "Sau khi duyệt, còn lại" (web không tự trừ tiền)
  actualBalance: 'Số dư thực tế',
  heldBalance: 'Đang giữ (chờ duyệt)',
  // [đề xuất] Figma không vẽ; 2.4 XRT b2 cần lịch sử giao dịch gần đây
  recentTitle: 'Giao dịch gần đây',
  recentEmpty: 'Chưa có giao dịch nào.',
  // [đề xuất] Thay câu "duyệt thủ công trong prototype" của Figma (chữ mô phỏng, PLAN 4.7 #7)
  manualNotice:
    'Khi duyệt, số tiền được trừ khỏi ví CLINIX của bệnh nhân. Hệ thống không tự chuyển khoản ngân hàng; việc chuyển tiền thực hiện ngoài hệ thống.',
  approve: 'Duyệt yêu cầu',
  reject: 'Từ chối',

  // Figma `567:2`
  approveTitle: (amount: string) => `Xác nhận duyệt rút ${amount}?`,
  approvePoints: (amount: string) => [
    `Số dư sẽ giảm ${amount} trong ví CLINIX.`,
    'Hệ thống không tự chuyển khoản ngân hàng.',
    'Thao tác không thể hoàn tác sau khi xác nhận.',
  ],
  approveConfirm: 'Xác nhận duyệt',
  cancel: 'Hủy',
  // Figma `581:2`; câu phụ sửa "lịch sử ví" thành "thông báo" vì ghi chú đi vào thông báo (Trung chốt 19/11/2026)
  rejectReasonLabel: 'Lý do từ chối',
  rejectReasonHint: 'Bắt buộc — bệnh nhân sẽ thấy lý do này trong thông báo.',
  rejectReasonPlaceholder:
    'Ví dụ: Số dư không đủ do đã sử dụng cho lịch hẹn...',
  rejectConfirm: 'Xác nhận từ chối',

  // [đề xuất] Trạng thái và lỗi chưa có frame
  listLoading: 'Đang tải danh sách yêu cầu...',
  listEmpty: 'Chưa có yêu cầu rút tiền nào.',
  listEmptyFiltered: 'Không có yêu cầu nào ở trạng thái này.',
  detailLoading: 'Đang tải chi tiết yêu cầu...',
  sending: 'Đang gửi...',
  approved: 'Đã duyệt yêu cầu rút tiền.',
  rejected: 'Đã từ chối yêu cầu rút tiền.',
  reasonRequired: 'Vui lòng nhập lý do từ chối.',
  reasonTooLong: (max: number) => `Lý do từ chối tối đa ${max} ký tự.`,
  alreadyHandled:
    'Yêu cầu này đã được xử lý bởi người khác. Dữ liệu đã được tải lại.',
  notFound: 'Không tìm thấy yêu cầu rút tiền.',
  uncertain:
    'Chưa rõ thao tác đã được ghi nhận hay chưa. Dữ liệu đã được tải lại, hãy kiểm tra trạng thái trước khi thử lại.',
  genericError: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
} as const;

/** Lý do từ chối tối đa 200 ký tự (khớp `WITHDRAWAL_NOTE_MAX` của API B12). */
export const REJECT_REASON_MAX = 200;
