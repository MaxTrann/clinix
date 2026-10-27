// Lỗi gửi email. KHÔNG phải AppException: AppException chỉ dành cho 4xx và gắn với HTTP, còn MailService không biết HTTP.
// Nơi gọi (A5, A11, admin) tự đổi thành mã lỗi API (GUI_MAIL_LOI…). Thông điệp là câu cố định theo `kind`:
// không chứa chữ của máy chủ SMTP, địa chỉ hay nội dung thư, và lỗi gốc cũng không được giữ lại làm `cause`.
export type MailSendErrorKind =
  | 'NOT_CONFIGURED' // chưa cấu hình SMTP (dev/test không có biến SMTP_*)
  | 'INVALID_MESSAGE' // người nhận/tiêu đề/nội dung không an toàn, bị từ chối trước khi chạm mạng
  | 'TLS' // không thiết lập được kết nối mã hoá (STARTTLS bị từ chối, chứng chỉ…)
  | 'AUTH' // đăng nhập SMTP bị từ chối
  | 'REJECTED' // máy chủ từ chối người nhận
  | 'TIMEOUT' // hết thời gian chờ kết nối/chào/phản hồi
  | 'CONNECTION' // không nối được hoặc đứt giữa chừng
  | 'UNKNOWN';

const MESSAGES: Record<MailSendErrorKind, string> = {
  NOT_CONFIGURED: 'Chưa cấu hình SMTP nên không gửi được email',
  INVALID_MESSAGE: 'Nội dung email không hợp lệ nên không được gửi',
  TLS: 'Không thiết lập được kết nối mã hoá tới máy chủ SMTP',
  AUTH: 'Máy chủ SMTP từ chối đăng nhập',
  REJECTED: 'Máy chủ SMTP từ chối người nhận',
  TIMEOUT: 'Hết thời gian chờ máy chủ SMTP',
  CONNECTION: 'Không kết nối được tới máy chủ SMTP',
  UNKNOWN: 'Gửi email thất bại',
};

export class MailSendError extends Error {
  readonly kind: MailSendErrorKind;
  /** Mã trả lời SMTP (ví dụ 535) nếu có, để chẩn đoán. */
  readonly smtpCode?: number;
  /** Với INVALID_MESSAGE: trường nào sai (chỉ tên trường, không có giá trị). */
  readonly field?: 'to' | 'subject' | 'text';

  constructor(
    kind: MailSendErrorKind,
    details: { smtpCode?: number; field?: 'to' | 'subject' | 'text' } = {},
  ) {
    super(MESSAGES[kind]);
    this.name = 'MailSendError';
    this.kind = kind;
    if (details.smtpCode !== undefined) this.smtpCode = details.smtpCode;
    if (details.field !== undefined) this.field = details.field;
  }
}
