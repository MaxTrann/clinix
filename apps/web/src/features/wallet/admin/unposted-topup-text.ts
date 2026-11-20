// Chữ của tab "Nạp ví chưa cộng" (payment F9). Có trong Figma `551:2` trừ các câu ghi [đề xuất] (trạng thái và bước xác nhận chưa có frame, PLAN 4.5).
export const UNPOSTED_TEXT = {
  // Figma `551:2`: dải thông tin đầu tab (bỏ "theo UC 53" và chữ SUCCESS tiếng Anh: [đề xuất])
  infoParts: [
    'Chỉ hiển thị các giao dịch đủ ',
    'cả ba điều kiện',
    ': (1) cổng thanh toán đã xác minh thành công, (2) chưa cộng vào ví, (3) ',
    'đã hết lượt đối soát tự động',
    '. Giao dịch thành công nhưng chưa hết lượt thử tự động không hiện ở đây vì hệ thống vẫn đang đối soát. Quản trị viên chỉ được cộng thủ công ',
    'đúng một lần',
    '.',
  ],
  tableLabel: 'Danh sách nạp ví chưa cộng',
  columnCode: 'Mã GD / Cổng TT',
  columnPatient: 'Bệnh nhân',
  columnAmount: 'Số tiền',
  columnVerified: 'Xác minh / Lượt thử',
  columnHandling: 'Trạng thái xử lý',
  gateway: { VNPay: 'VNPAY', MoMo: 'MOMO' },
  // [đề xuất] Figma ghi "SUCCESS"
  verified: 'Đã xác minh',
  attempts: (n: number, max: number) =>
    `Đã thử ${n}/${max} lần${n >= max ? ' — hết lượt' : ''}`,
  handling: { ChoXuLy: 'Chờ xử lý', KhongTheXuLy: 'Không thể xử lý' },
  credit: 'Cộng ví',
  unprocessable: 'Không thể xử lý',
  creditOf: (name: string) => `Cộng ví cho giao dịch của ${name}`,
  unprocessableOf: (name: string) =>
    `Ghi nhận không thể xử lý giao dịch của ${name}`,

  // [đề xuất] Bước xác nhận và ô lý do (Figma chưa có frame)
  creditTitle: 'Cộng ví thủ công',
  unprocessableTitle: 'Không thể xử lý',
  codeLabel: 'Mã giao dịch',
  patientLabel: 'Bệnh nhân',
  amountLabel: 'Số tiền',
  creditPoints: (amount: string) => [
    `Ví của bệnh nhân sẽ được cộng ${amount} (đúng số tiền cổng đã xác minh).`,
    'Mỗi giao dịch chỉ được cộng một lần; thao tác không thể hoàn tác.',
  ],
  creditConfirm: 'Xác nhận cộng ví',
  reasonLabel: 'Lý do',
  reasonHint:
    'Bắt buộc, 10 đến 255 ký tự. Lý do chỉ ghi vào nhật ký; bệnh nhân nhận thông báo chung, không thấy lý do này.',
  reasonPlaceholder: 'Ví dụ: Ngân hàng đang tra soát lại giao dịch này...',
  unprocessableConfirm: 'Xác nhận',
  cancel: 'Hủy',
  sending: 'Đang gửi...',

  loading: 'Đang tải danh sách nạp ví chưa cộng...',
  empty: 'Không có giao dịch nạp ví nào cần xử lý.',
  credited: 'Đã cộng tiền vào ví của bệnh nhân.',
  markedUnprocessable:
    'Đã ghi nhận không thể xử lý. Giao dịch vẫn ở danh sách để xử lý sau.',
  reasonRequired: 'Vui lòng nhập lý do (ít nhất 10 ký tự).',
  reasonTooLong: 'Lý do tối đa 255 ký tự.',
  // Theo mã lỗi (PLAN 5.14 khi có)
  alreadyCredited:
    'Giao dịch này đã được cộng vào ví. Danh sách đã được tải lại.',
  notInQueue:
    'Giao dịch không còn ở danh sách cần xử lý. Danh sách đã được tải lại.',
  uncertain:
    'Chưa rõ thao tác đã được ghi nhận hay chưa. Danh sách đã được tải lại, hãy kiểm tra trước khi thử lại.',
  genericError: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
} as const;

/** Khớp `AUDIT_PAYMENT_LIMITS` của API B15 (lý do có ghi nhật ký). */
export const UNPROCESSABLE_REASON_MIN = 10;
export const UNPROCESSABLE_REASON_MAX = 255;
