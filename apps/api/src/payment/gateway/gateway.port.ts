import type { TopupGateway } from '../../wallet/wallet.constants.js';

// `PaymentGatewayPort` — cổng ra tới cổng thanh toán nạp ví (PLAN payment 5.4; payment B3). Hai bộ điều hợp: `VnpayGateway` (B3) và `MomoGateway` (B16).
// `IpnService` (B4) chỉ làm việc qua giao diện này nên MỘT luồng xử lý tín hiệu dùng chung cho cả hai cổng.

export interface CreatePaymentInput {
  /** `giao_dich_thanh_toan_id` dạng chuỗi số; gửi sang cổng làm mã đơn (VNPAY: `vnp_TxnRef`). */
  readonly giaoDichId: string;
  /** Số tiền nạp dạng chuỗi decimal như cột DB ("100000.00"). */
  readonly soTien: string;
  /** IP của Bệnh nhân (VNPAY bắt buộc `vnp_IpAddr`). */
  readonly clientIp: string;
  /** Thời điểm tạo, lấy từ `nowVN()` ở tầng service (test dùng đồng hồ giả). */
  readonly now: Date;
}

/** Tín hiệu đã xác minh chữ ký. `amountCents` cùng đơn vị với `toCents` (0,01 đồng) để so trực tiếp với số tiền của dòng giao dịch. */
export interface VerifiedSignal {
  readonly kind: 'Verified';
  readonly txnRef: string;
  readonly amountCents: bigint;
  readonly result: 'ThanhCong' | 'ThatBai';
  /** Mã giao dịch phía cổng, `null` khi cổng không cấp mã (ví dụ giao dịch bị huỷ). */
  readonly gatewayCode: string | null;
}

/** Chữ ký sai, thiếu hay tín hiệu sai định dạng: xử lý như nhau (không đọc DB, không đổi dữ liệu). */
export interface InvalidSignal {
  readonly kind: 'InvalidSignature';
}

/** Kết quả `IpnService` xử lý một tín hiệu (bảng "Xử lý IPN" ở PLAN 5.4); mỗi cổng đổi sang định dạng phản hồi riêng bằng `ackFor`. */
export type IpnOutcome =
  | 'Processed' // đã ghi kết quả lần đầu (thành công hay thất bại)
  | 'NotFound' // không có giao dịch nạp của đúng cổng
  | 'AlreadyHandled' // tín hiệu lặp hoặc trái kết quả đã ghi
  | 'InvalidAmount' // số tiền không khớp
  | 'InvalidSignature'
  | 'Error'; // chưa lưu được kết quả: để cổng gửi lại

/** Phản hồi trả cho cổng (VNPAY: `{ RspCode, Message }`). */
export type GatewayAck = Readonly<Record<string, string>>;

export interface PaymentGatewayPort {
  readonly gateway: TopupGateway;
  createPayment(input: CreatePaymentInput): Promise<{ redirectUrl: string }>;
  /** Hàm THUẦN: không DB, không mạng, không ném lỗi với mọi đầu vào. */
  verifyIpn(
    raw: Readonly<Record<string, unknown>>,
  ): VerifiedSignal | InvalidSignal;
  ackFor(outcome: IpnOutcome): GatewayAck;
}

/** Cổng thiếu biến môi trường. B4 đổi lỗi này sang 503 `CONG_THANH_TOAN_CHUA_CAU_HINH` (PLAN 5.14) và không tạo dòng giao dịch. */
export class GatewayNotConfiguredError extends Error {
  readonly code = 'NOT_CONFIGURED';

  constructor(readonly gateway: TopupGateway) {
    // Chỉ ghi tên cổng; KHÔNG kèm giá trị biến môi trường nào.
    super(`Cổng ${gateway} chưa cấu hình`);
    this.name = 'GatewayNotConfiguredError';
  }
}
