// Chữ của trang "Ví của tôi" (payment F1). Có trong Figma `417:2`, `437:2` trừ các câu ghi [đề xuất] (trạng thái chưa có frame, PLAN 4.5).
export const WALLET_TEXT = {
  title: 'Ví CLINIX',
  subtitle: 'Quản lý số dư, nạp tiền, rút tiền và theo dõi lịch sử giao dịch.',

  // Thẻ số dư. Thẻ thứ ba là "Đang giữ chờ duyệt rút" của `437:2` thay "Tổng số dư trong ví" của `417:2` (PLAN L9, WVI-01: không gọi tổng là số dư; Trung chọn 17/11/2026)
  balancesLabel: 'Số dư ví',
  available: 'Số dư khả dụng',
  availableHint: 'Sẵn sàng sử dụng để thanh toán',
  pendingTopup: 'Nạp chờ xác nhận',
  pendingTopupHint: 'Giao dịch nạp tiền đang được xử lý',
  held: 'Đang giữ chờ duyệt rút',
  heldHint: 'Sẽ được giải phóng khi từ chối hoặc trừ khi duyệt',

  actionsTitle: 'Thao tác ví',
  actionsSubtitle: 'Nạp tiền vào ví hoặc yêu cầu rút tiền về tài khoản.',
  topupTab: 'Nạp tiền',
  withdrawTab: 'Rút tiền',
  // [đề xuất] Nội dung tab rút do payment F6 làm; chưa có thì hiện câu này (Trung chọn 17/11/2026)
  tabComingSoon: 'Chức năng đang được phát triển.',
  // [đề xuất] payment F2: tab nạp chờ hạn mức và cổng của lần tải số dư; lỗi thì chưa có gì để hiện
  topupLoading: 'Đang tải thông tin nạp tiền...',
  topupUnavailable:
    'Chưa tải được thông tin nạp tiền. Hãy bấm "Thử lại" ở phần số dư phía trên.',

  latestWithdrawal: 'Yêu cầu rút gần nhất',
  noWithdrawal: 'Chưa có yêu cầu rút tiền',

  // Ba mục chưa có trang đích: nút vô hiệu, nếp mục menu chưa có `to` (Trung chọn 17/11/2026)
  supportTitle: 'Hỗ trợ & hướng dẫn',
  supportTerms: 'Điều khoản sử dụng ví',
  supportSecurity: 'Bảo mật tài khoản',
  supportFaq: 'Câu hỏi thường gặp',
  notAvailable: '(chưa được triển khai)',

  historyTitle: 'Lịch sử giao dịch',
  historySubtitle: 'Bao gồm giao dịch ví và yêu cầu rút tiền.',
  historyFilterLabel: 'Lọc theo loại giao dịch',
  columnTime: 'Thời gian',
  columnType: 'Loại',
  columnContent: 'Nội dung',
  columnAmount: 'Số tiền',
  columnStatus: 'Trạng thái',
  // [đề xuất] Trạng thái chưa có frame
  historyLoading: 'Đang tải lịch sử giao dịch...',
  historyEmpty: 'Chưa có giao dịch nào.',
  historyEmptyFiltered: 'Không có giao dịch nào thuộc loại này.',
  balanceLoading: 'Đang tải số dư...',
  previousPage: 'Trang trước',
  nextPage: 'Trang sau',
  pageStatus: (page: number, pages: number) => `Trang ${page}/${pages}`,
} as const;
