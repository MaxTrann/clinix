import { VIETNAM_TIME_ZONE } from '../../../common/time/time.js';
import { toCents } from '../../../pricing/money.js';
import {
  GatewayNotConfiguredError,
  type CreatePaymentInput,
  type GatewayAck,
  type InvalidSignal,
  type IpnOutcome,
  type PaymentGatewayPort,
  type VerifiedSignal,
} from '../gateway.port.js';
import type { VnpayConfig } from './vnpay-config.js';
import {
  encodeVnpayValue,
  signVnpay,
  verifyVnpaySignature,
} from './vnpay-signature.js';

// Bộ điều hợp VNPAY (payment B3; PLAN 5.4). Tạo yêu cầu = DỰNG URL tại chỗ (không gọi mạng); xác minh IPN = hàm thuần.
// Nối vào Nest ở B4 (nơi đầu tiên dùng tới), theo nếp "không nhập trước thứ chưa có người dùng".

/** `[đề xuất]` Hạn thanh toán của một yêu cầu: 15 phút sau lúc tạo (PLAN 5.4). */
export const VNPAY_EXPIRE_MINUTES = 15;

/** Câu cố định, không dấu, KHÔNG chứa thông tin người dùng (PLAN 5.4; CGS-11). */
export const VNPAY_ORDER_INFO = 'Nap tien vao vi CLINIX';

const INVALID: InvalidSignal = { kind: 'InvalidSignature' };

/** `vnp_Amount` có tối đa 12 chữ số (`Numeric[1,12]`). */
const VNPAY_AMOUNT = /^\d{1,12}$/;

/** Bảng phản hồi IPN theo tài liệu VNPAY: `00`/`02` ⇒ VNPAY dừng gửi; mã khác hay hết giờ ⇒ VNPAY gửi lại (tối đa 10 lần, cách 5 phút). */
const ACK: Readonly<Record<IpnOutcome, GatewayAck>> = {
  Processed: { RspCode: '00', Message: 'Confirm Success' },
  NotFound: { RspCode: '01', Message: 'Order not found' },
  AlreadyHandled: { RspCode: '02', Message: 'Order already confirmed' },
  InvalidAmount: { RspCode: '04', Message: 'Invalid amount' },
  InvalidSignature: { RspCode: '97', Message: 'Invalid signature' },
  Error: { RspCode: '99', Message: 'Unknown error' },
};

// Giờ Việt Nam `yyyyMMddHHmmss`, không phụ thuộc TZ của máy chạy API.
const vnDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function formatVnpayDate(instant: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    vnDateTimeFormatter.formatToParts(instant).find((p) => p.type === type)
      ?.value ?? '';
  return `${part('year')}${part('month')}${part('day')}${part('hour')}${part('minute')}${part('second')}`;
}

export class VnpayGateway implements PaymentGatewayPort {
  readonly gateway = 'VNPay' as const;

  /** `config = null` ⇒ cổng chưa cấu hình (thiếu biến môi trường). */
  constructor(private readonly config: VnpayConfig | null) {}

  get configured(): boolean {
    return this.config !== null;
  }

  // `async` dù không chờ gì (VNPAY dựng URL tại chỗ): mọi lỗi thành Promise bị từ chối, cùng một kiểu với MoMo (gọi mạng) cho nơi gọi.
  async createPayment(
    input: CreatePaymentInput,
  ): Promise<{ redirectUrl: string }> {
    const config = this.requireConfig();
    // `vnp_Amount` = số đồng × 100 = đúng đơn vị của `toCents` (một hàm đổi tiền, không công thức thứ hai).
    const amount = toCents(input.soTien).toString();
    if (amount === '0' || !VNPAY_AMOUNT.test(amount)) {
      throw new Error('Số tiền nạp ngoài khoảng VNPAY nhận');
    }
    const expireAt = new Date(
      input.now.getTime() + VNPAY_EXPIRE_MINUTES * 60_000,
    );
    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: config.tmnCode,
      vnp_Amount: amount,
      vnp_CurrCode: 'VND',
      vnp_IpAddr: plainIp(input.clientIp),
      vnp_Locale: 'vn',
      vnp_OrderInfo: VNPAY_ORDER_INFO,
      vnp_OrderType: 'other',
      vnp_ReturnUrl: config.returnUrl,
      vnp_TxnRef: input.giaoDichId,
      vnp_CreateDate: formatVnpayDate(input.now),
      vnp_ExpireDate: formatVnpayDate(expireAt),
    };
    // Chuỗi truy vấn dùng ĐÚNG cách mã hoá của chuỗi ký, nên phần trước `vnp_SecureHash` chính là chuỗi đã ký.
    const query = Object.keys(params)
      .sort()
      .map(
        (name) =>
          `${encodeVnpayValue(name)}=${encodeVnpayValue(params[name] ?? '')}`,
      )
      .join('&');
    const hash = signVnpay(params, config.hashSecret);
    return { redirectUrl: `${config.payUrl}?${query}&vnp_SecureHash=${hash}` };
  }

  verifyIpn(
    raw: Readonly<Record<string, unknown>>,
  ): VerifiedSignal | InvalidSignal {
    if (this.config === null) return INVALID; // chưa cấu hình thì không có khoá để xác minh
    const params = vnpParamsAsStrings(raw);
    if (params === null) return INVALID;
    if (!verifyVnpaySignature(params, this.config.hashSecret)) return INVALID;
    // Chữ ký đúng nhưng của merchant khác hay thiếu trường bắt buộc ⇒ cũng coi là không hợp lệ.
    if (params.vnp_TmnCode !== this.config.tmnCode) return INVALID;
    const txnRef = params.vnp_TxnRef;
    const amount = params.vnp_Amount;
    if (!txnRef || amount === undefined || !VNPAY_AMOUNT.test(amount))
      return INVALID;

    // Chỉ thành công khi CẢ HAI mã đều `00` (tài liệu VNPAY; số đo: huỷ ⇒ `24`/`02`).
    const success =
      params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';
    return {
      kind: 'Verified',
      txnRef,
      amountCents: BigInt(amount),
      result: success ? 'ThanhCong' : 'ThatBai',
      gatewayCode: gatewayCodeOf(params.vnp_TransactionNo),
    };
  }

  ackFor(outcome: IpnOutcome): GatewayAck {
    return ACK[outcome];
  }

  private requireConfig(): VnpayConfig {
    if (this.config === null) throw new GatewayNotConfiguredError(this.gateway);
    return this.config;
  }
}

/**
 * Lấy các tham số `vnp_` dạng chuỗi. Tham số lặp tên (Express đọc thành mảng) hay kiểu lạ ⇒ `null` (không hợp lệ, không ném lỗi).
 * Tham số không phải `vnp_` bị bỏ qua: không vào chuỗi ký.
 */
function vnpParamsAsStrings(
  raw: Readonly<Record<string, unknown>>,
): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!name.startsWith('vnp_')) continue;
    if (typeof value !== 'string') return null;
    params[name] = value;
  }
  return params;
}

/**
 * `vnp_TransactionNo` ⇒ mã giao dịch phía cổng. Số đo M12: giao dịch bị huỷ có `vnp_TransactionNo = "0"`. Lưu "0" vào cột UNIQUE
 * `ma_giao_dich_cong` thì lần huỷ thứ hai sẽ trùng khoá (1062), nên "0", rỗng hay không phải số ⇒ `null`.
 */
/** Express trả IPv4 dạng IPv6 ánh xạ ("::ffff:203.0.113.7") khi máy chủ nghe cả IPv6: bỏ tiền tố để VNPAY nhận địa chỉ IPv4 thường. Rỗng ⇒ "127.0.0.1". */
export function plainIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed === '') return '127.0.0.1';
  return trimmed.startsWith('::ffff:')
    ? trimmed.slice('::ffff:'.length)
    : trimmed;
}

function gatewayCodeOf(transactionNo: string | undefined): string | null {
  if (transactionNo === undefined || !/^\d+$/.test(transactionNo)) return null;
  return /^0+$/.test(transactionNo) ? null : transactionNo;
}
