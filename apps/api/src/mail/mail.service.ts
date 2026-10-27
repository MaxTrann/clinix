// Giao diện gửi email dùng chung (task P4 của module auth; admin dùng lại cho link kích hoạt nhân sự, B14).
// Chỉ có ba trường: người gọi KHÔNG thể truyền bcc, header tuỳ ý hay tệp đính kèm.
export interface MailMessage {
  /** Đúng MỘT địa chỉ email (đã chuẩn hoá bởi chính sách email của auth, A1). Bị kiểm lại ở mail/mail-safety.ts. */
  readonly to: string;
  readonly subject: string;
  /** Văn bản thô. Mẫu HTML theo Figma thuộc task A14. */
  readonly text: string;
}

/**
 * Lớp trừu tượng này CHÍNH LÀ token inject: nơi dùng ghi `@Inject(MailService)`, test thay bằng `FakeMailService`
 * (mail/testing/) hoặc `{ provide: MailService, useValue: ... }`.
 *
 * Hợp đồng cho N1 (chỉ thu hồi mã OTP cũ SAU KHI gửi thành công):
 * - `send` resolve khi và chỉ khi máy chủ SMTP đã NHẬN thư cho người nhận.
 * - Mọi trường hợp khác reject bằng `MailSendError`. Không có nhánh "có thể đã gửi", không tự thử lại, không gửi nền.
 * - Hết thời gian sau khi đã gửi DATA thì kết quả không chắc chắn; vẫn coi là lỗi (xem docs/TECH_DEBT.md).
 * - Resolve KHÔNG có nghĩa người nhận đã đọc hay hộp thư đã nhận được thư (spam, bounce muộn).
 */
export abstract class MailService {
  abstract send(message: MailMessage): Promise<void>;
}
